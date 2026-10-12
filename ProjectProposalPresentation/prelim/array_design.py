#!/usr/bin/env python3
"""
array_design.py - preliminary O1 results for the 1x32 irregular OPA (pure Python).

Array factor of N ideal (isotropic) emitters at positions x_n with a linear phase tilt
that steers the beam to theta_0:

    AF(u) = (1/N) * sum_n exp(j k x_n u),   u = sin(theta) - sin(theta_0),  k = 2 pi / lambda

|AF|^2 = 1 at u = 0 is the main beam. Steering only slides the visible window
u in [-1 - sin(theta_0), 1 - sin(theta_0)] across the same pattern, so "every side lobe
>= 10 dB below the main beam for all steering up to +/-45 deg" is the single condition

    max |AF(u)|^2 outside the main lobe, over |u| <= 1 + sin(45 deg)  <=  -10 dB.

That number is the peak side-lobe level (PSL) used throughout. A uniform array at
1.5 um fails it (grating lobe at u = lambda/d = 1.03, i.e. 0 dB). The search below
picks the N-1 gaps (each >= the minimum pitch) that minimize the PSL.

Search: the PSL is a max, so it has no useful gradient. L-BFGS-B instead minimizes a
smooth stand-in, (1/q) log sum_i p_i^q over the side-lobe samples p_i, which tends to the
log of the max as q grows (q = 8 -> 32 -> 128), with the analytic gradient. That is
repeated from many random starting gap sets and the best true PSL is kept.

Outputs (next to this script):
  figures/*.png   - slide-ready figures
  results.json    - optimized positions and every number quoted on the slides

Run:  python array_design.py          (about 5 min, mostly the trade-off sweeps)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
FIG_DIR = HERE / "figures"
RESULTS_PATH = HERE / "results.json"


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class ArrayConfig:
    wavelength_um: float = 1.55
    n_emitters: int = 32
    min_pitch_um: float = 1.5       # smallest allowed emitter gap (crosstalk limit)
    max_pitch_um: float = 4.0       # largest gap the search may use
    steer_max_deg: float = 45.0
    target_psl_db: float = -10.0
    seed: int = 1
    n_starts: int = 30              # random starting gap sets for the search
    sweep_starts: int = 12          # fewer starts per point in the trade-off sweeps

    @property
    def u_max(self) -> float:
        return 1.0 + np.sin(np.radians(self.steer_max_deg))

    def u_grid(self, oversample: int = 8) -> np.ndarray:
        """u from 0 to u_max, sampled finely enough for the widest allowed aperture."""
        aperture_max = (self.n_emitters - 1) * self.max_pitch_um
        du = self.wavelength_um / (oversample * aperture_max)
        return np.arange(0.0, self.u_max + du, du)


CFG = ArrayConfig()


# =============================================================================
# Array factor and peak side-lobe level
# =============================================================================

def positions_from_gaps(gaps: np.ndarray) -> np.ndarray:
    x = np.concatenate([[0.0], np.cumsum(gaps)])
    return x - x.mean()


def array_power(x_um, u, wavelength_um, phase_err=None):
    """|AF(u)|^2 normalized to 1 for an error-free main beam."""
    k = 2 * np.pi / wavelength_um
    arg = k * np.outer(u, x_um)
    if phase_err is not None:
        arg = arg + phase_err
    af = np.exp(1j * arg).sum(axis=1) / len(x_um)
    return np.abs(af) ** 2


def main_lobe_edges(p: np.ndarray, i_peak: int) -> tuple[int, int]:
    """Walk downhill from the peak to the first local minimum on each side."""
    lo = i_peak
    while lo > 0 and p[lo - 1] < p[lo]:
        lo -= 1
    hi = i_peak
    while hi < len(p) - 1 and p[hi + 1] < p[hi]:
        hi += 1
    return lo, hi


def psl_db(x_um, cfg: ArrayConfig, u=None) -> float:
    """Worst side lobe over 0 <= u <= u_max (|AF| is even in u for error-free phases)."""
    u = cfg.u_grid() if u is None else u
    p = array_power(x_um, u, cfg.wavelength_um)
    _, hi = main_lobe_edges(p, 0)
    return 10 * np.log10(p[hi:].max())


def psl_db_with_errors(x_um, cfg: ArrayConfig, phase_err, u) -> float:
    """PSL for a two-sided u grid; the main beam is the strongest peak near u = 0."""
    p = array_power(x_um, u, cfg.wavelength_um, phase_err)
    near = np.abs(u) < 2 * cfg.wavelength_um / np.ptp(x_um)
    i_peak = np.flatnonzero(near)[np.argmax(p[near])]
    lo, hi = main_lobe_edges(p, i_peak)
    side = np.concatenate([p[:lo], p[hi + 1:]])
    return 10 * np.log10(side.max() / p[i_peak])


def uniform_positions(cfg: ArrayConfig) -> np.ndarray:
    return positions_from_gaps(np.full(cfg.n_emitters - 1, cfg.min_pitch_um))


# =============================================================================
# Search
# =============================================================================

def soft_psl(gaps, q, cfg: ArrayConfig, u):
    """(1/q) log sum p_i^q over the side lobes, and its gradient w.r.t. the gaps."""
    k = 2 * np.pi / cfg.wavelength_um
    n = len(gaps) + 1
    x = positions_from_gaps(gaps)
    e = np.exp(1j * k * np.outer(u, x))
    af = e.sum(axis=1) / n
    p = np.abs(af) ** 2
    _, hi = main_lobe_edges(p, 0)
    side = p[hi:]
    w = (side / side.max()) ** q
    f = np.log(side.max()) + np.log(w.sum()) / q
    df_dp = np.zeros_like(p)
    df_dp[hi:] = w / (w.sum() * side)
    dp_dx = 2 * np.real(np.conj(af)[:, None] * 1j * k * u[:, None] * e / n)
    df_dx = df_dp @ dp_dx
    df_dx -= df_dx.mean()                       # positions are re-centered
    return f, np.cumsum(df_dx[::-1])[::-1][1:]  # gap n moves every emitter after it


def optimize_positions(cfg: ArrayConfig) -> np.ndarray:
    rng = np.random.default_rng(cfg.seed)
    u = cfg.u_grid()
    fine = cfg.u_grid(oversample=32)
    bounds = [(cfg.min_pitch_um, cfg.max_pitch_um)] * (cfg.n_emitters - 1)
    best_psl, best_x = np.inf, None
    for _ in range(cfg.n_starts):
        g = rng.uniform(cfg.min_pitch_um, cfg.max_pitch_um, cfg.n_emitters - 1)
        for q in (8, 32, 128):
            g = minimize(soft_psl, g, args=(q, cfg, u), jac=True, method="L-BFGS-B",
                         bounds=bounds, options={"maxiter": 400}).x
        x = positions_from_gaps(g)
        val = psl_db(x, cfg, fine)
        if val < best_psl:
            best_psl, best_x = val, x
    return best_x


def random_psl(cfg: ArrayConfig, n_draws: int = 300) -> np.ndarray:
    """PSL of un-optimized arrays: every gap drawn uniformly from the same bounds."""
    rng = np.random.default_rng(cfg.seed)
    u = cfg.u_grid()
    return np.array([
        psl_db(positions_from_gaps(rng.uniform(cfg.min_pitch_um, cfg.max_pitch_um,
                                               cfg.n_emitters - 1)), cfg, u)
        for _ in range(n_draws)
    ])


def beamwidth_deg(x_um, cfg: ArrayConfig) -> float:
    """Broadside -3 dB full width of the main beam."""
    u = np.linspace(0, 4 * cfg.wavelength_um / np.ptp(x_um), 20001)
    p = array_power(x_um, u, cfg.wavelength_um)
    u_half = u[np.argmax(p < 0.5)]
    return 2 * np.degrees(np.arcsin(u_half))


# =============================================================================
# Figures
# =============================================================================

UNIFORM_COLOR = "#eb6834"
IRREGULAR_COLOR = "#2a78d6"
BASELINE_COLOR = "#8a8883"     # un-optimized reference (orange stays "uniform" everywhere)
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#d9d8d4"
SURFACE = "#fcfcfb"
BLUE_RAMP = [SURFACE, "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5",
             "#256abf", "#184f95", "#0d366b"]

plt.rcParams.update({
    "font.family": ["Arial", "DejaVu Sans"],
    "font.size": 15,
    "text.color": INK,
    "axes.labelcolor": INK,
    "axes.edgecolor": INK_2,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.color": INK_2,
    "ytick.color": INK_2,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "savefig.facecolor": SURFACE,
    "legend.frameon": False,
})


def grid(ax):
    ax.grid(True, color=GRID, lw=0.8)
    ax.set_axisbelow(True)


def save(fig, name):
    FIG_DIR.mkdir(exist_ok=True)
    fig.savefig(FIG_DIR / f"{name}.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


def far_field_db(x_um, cfg, steer_deg, theta_deg):
    u = np.sin(np.radians(theta_deg)) - np.sin(np.radians(steer_deg))
    return 10 * np.log10(np.maximum(array_power(x_um, u, cfg.wavelength_um), 1e-6))


def fig_far_field(x_uni, x_irr, cfg, steer_deg=30.0):
    theta = np.linspace(-90, 90, 7201)
    fig, axes = plt.subplots(2, 1, figsize=(11, 6.2), sharex=True)
    for ax, x, color, label in [
        (axes[0], x_uni, UNIFORM_COLOR, f"Uniform, {cfg.min_pitch_um:g} µm pitch"),
        (axes[1], x_irr, IRREGULAR_COLOR, f"Optimized irregular, gaps ≥ {cfg.min_pitch_um:g} µm"),
    ]:
        ax.plot(theta, far_field_db(x, cfg, steer_deg, theta), color=color, lw=2)
        ax.axhline(cfg.target_psl_db, color=INK_2, lw=1.4, ls="--")
        ax.text(-88, cfg.target_psl_db + 1.2, f"{cfg.target_psl_db:g} dB target",
                color=INK_2, fontsize=13)
        ax.set_ylim(-30, 3)
        ax.set_ylabel("Power (dB)")
        ax.set_title(label, loc="left", fontsize=15, color=INK)
        grid(ax)
    p_gl = far_field_db(x_uni, cfg, steer_deg, theta)
    i_gl = np.argmax(np.where(theta < 0, p_gl, -99))
    axes[0].annotate("grating lobe", xy=(theta[i_gl], p_gl[i_gl]),
                     xytext=(theta[i_gl] - 32, -6), color=INK, fontsize=14,
                     arrowprops=dict(arrowstyle="->", color=INK_2))
    axes[0].annotate("main beam", xy=(steer_deg, 0), xytext=(steer_deg + 12, -6),
                     color=INK, fontsize=14, arrowprops=dict(arrowstyle="->", color=INK_2))
    axes[1].set_xlabel("Far-field angle θ (deg)")
    axes[1].set_xticks(np.arange(-90, 91, 30))
    fig.suptitle(f"N = {cfg.n_emitters}, λ = {cfg.wavelength_um * 1e3:g} nm, "
                 f"beam steered to {steer_deg:g}°", x=0.125, ha="left", fontsize=14,
                 color=INK_2)
    fig.tight_layout()
    save(fig, "far_field_uniform_vs_irregular")


def psl_vs_steering(x_um, cfg, steer_deg):
    theta = np.linspace(-90, 90, 14401)
    out = []
    for s in steer_deg:
        u = np.sin(np.radians(theta)) - np.sin(np.radians(s))
        p = array_power(x_um, u, cfg.wavelength_um)
        lo, hi = main_lobe_edges(p, np.argmax(p))
        side = np.concatenate([p[:lo], p[hi + 1:]])
        out.append(10 * np.log10(side.max()))
    return np.array(out)


def fig_psl_vs_steering(x_uni, x_irr, cfg):
    steer = np.linspace(-cfg.steer_max_deg, cfg.steer_max_deg, 181)
    psl_uni = psl_vs_steering(x_uni, cfg, steer)
    psl_irr = psl_vs_steering(x_irr, cfg, steer)
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(steer, psl_uni, color=UNIFORM_COLOR, lw=2)
    ax.plot(steer, psl_irr, color=IRREGULAR_COLOR, lw=2)
    ax.axhline(cfg.target_psl_db, color=INK_2, lw=1.4, ls="--")
    ax.text(-44, cfg.target_psl_db + 0.6, f"{cfg.target_psl_db:g} dB target",
            color=INK_2, fontsize=13)
    ax.text(-44, -0.9, f"Uniform {cfg.min_pitch_um:g} µm: grating lobe ≈ 0 dB",
            color=INK, fontsize=14, va="top")
    ax.text(-44, psl_irr.max() - 0.7, f"Optimized irregular: ≤ {psl_irr.max():.1f} dB",
            color=INK, fontsize=14, va="top")
    ax.set_ylim(-20, 1.5)
    ax.set_yticks(np.arange(-20, 1, 5))
    ax.set_xlim(-cfg.steer_max_deg, cfg.steer_max_deg)
    ax.set_xticks(np.arange(-45, 46, 15))
    ax.set_xlabel("Steering angle θ₀ (deg)")
    ax.set_ylabel("Worst side lobe (dB)")
    grid(ax)
    fig.tight_layout()
    save(fig, "psl_vs_steering")


def fig_steering_map(x_uni, x_irr, cfg):
    theta = np.linspace(-90, 90, 1441)
    steer = np.linspace(-cfg.steer_max_deg, cfg.steer_max_deg, 361)
    cmap = LinearSegmentedColormap.from_list("blue", BLUE_RAMP)
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.4), sharey=True)
    for ax, x, title in [(axes[0], x_uni, f"Uniform, {cfg.min_pitch_um:g} µm"),
                         (axes[1], x_irr, "Optimized irregular")]:
        img = np.array([far_field_db(x, cfg, s, theta) for s in steer]).T
        mesh = ax.pcolormesh(steer, theta, img, cmap=cmap, vmin=-30, vmax=0,
                             shading="auto", rasterized=True)
        ax.set_title(title, loc="left", fontsize=15)
        ax.set_xlabel("Steering angle θ₀ (deg)")
        ax.set_xticks(np.arange(-45, 46, 15))
        for s in ax.spines.values():
            s.set_visible(False)
    axes[0].set_ylabel("Far-field angle θ (deg)")
    axes[0].set_yticks(np.arange(-90, 91, 30))
    cb = fig.colorbar(mesh, ax=axes, pad=0.02, shrink=0.9)
    cb.set_label("Power (dB)")
    cb.outline.set_visible(False)
    save(fig, "steering_map")


def fig_positions(x_uni, x_irr, cfg):
    fig, ax = plt.subplots(figsize=(11, 2.8))
    for y, x, color in [(1, x_uni, UNIFORM_COLOR), (0, x_irr, IRREGULAR_COLOR)]:
        ax.vlines(x, y - 0.32, y + 0.32, color=color, lw=2.2)
    ax.set_yticks([1, 0])
    ax.set_yticklabels([f"Uniform\n{np.ptp(x_uni):.0f} µm wide",
                        f"Irregular\n{np.ptp(x_irr):.0f} µm wide"])
    ax.set_ylim(-0.6, 1.6)
    ax.set_xlabel("Emitter position (µm)")
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    grid(ax)
    ax.grid(False, axis="y")
    fig.tight_layout()
    save(fig, "emitter_positions")


def fig_tradeoffs(sweep_n, sweep_pitch, cfg):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), sharey=True)
    for ax, sweep, key, xlabel in [
        (axes[0], sweep_n, "n_emitters", "Number of emitters N"),
        (axes[1], sweep_pitch, "min_pitch_um", "Minimum gap (µm)"),
    ]:
        xs = [r[key] for r in sweep]
        ax.plot(xs, [r["psl_random_median_db"] for r in sweep], color=BASELINE_COLOR,
                lw=2, marker="o", ms=8, label="Random irregular (median)")
        ax.plot(xs, [r["psl_opt_db"] for r in sweep], color=IRREGULAR_COLOR,
                lw=2, marker="o", ms=8, label="Optimized irregular")
        ax.axhline(cfg.target_psl_db, color=INK_2, lw=1.4, ls="--")
        ax.set_xlabel(xlabel)
        ax.set_xticks(xs)
        grid(ax)
    axes[1].text(axes[1].get_xlim()[1], cfg.target_psl_db + 0.3,
                 f"{cfg.target_psl_db:g} dB target", color=INK_2, fontsize=13, ha="right")
    axes[0].set_ylabel("Worst side lobe, ±45° (dB)")
    axes[0].legend(loc="upper right", fontsize=13)
    axes[0].set_title(f"Gaps ≥ {cfg.min_pitch_um:g} µm", loc="left", fontsize=15)
    axes[1].set_title(f"N = {cfg.n_emitters}", loc="left", fontsize=15)
    fig.tight_layout()
    save(fig, "psl_tradeoffs")


def fig_phase_errors(phase_sweep, cfg):
    sig = np.array([r["sigma_deg"] for r in phase_sweep])
    med = np.array([r["psl_median_db"] for r in phase_sweep])
    p10 = np.array([r["psl_p10_db"] for r in phase_sweep])
    p90 = np.array([r["psl_p90_db"] for r in phase_sweep])
    fig, ax = plt.subplots(figsize=(11, 4.8))
    ax.fill_between(sig, p10, p90, color="#cde2fb", lw=0, label="10–90 % of trials")
    ax.plot(sig, med, color=IRREGULAR_COLOR, lw=2, marker="o", ms=7, label="Median")
    ax.axhline(cfg.target_psl_db, color=INK_2, lw=1.4, ls="--")
    ax.text(sig[-1], cfg.target_psl_db - 0.5, f"{cfg.target_psl_db:g} dB target ",
            color=INK_2, fontsize=13, ha="right", va="top")
    ax.set_xlabel("RMS phase error per emitter (deg)")
    ax.set_ylabel("Worst side lobe, ±45° (dB)")
    ax.set_xlim(0, sig[-1])
    ax.legend(loc="upper left", fontsize=13)
    grid(ax)
    fig.tight_layout()
    save(fig, "phase_error_tolerance")


# =============================================================================
# Main
# =============================================================================

def phase_error_sweep(x_um, cfg, sigmas_deg, n_trials=300):
    rng = np.random.default_rng(cfg.seed)
    u = cfg.u_grid()
    u = np.concatenate([-u[:0:-1], u])
    out = []
    for s in sigmas_deg:
        vals = np.array([
            psl_db_with_errors(x_um, cfg, rng.normal(0, np.radians(s), len(x_um)), u)
            for _ in range(n_trials)
        ])
        out.append({"sigma_deg": float(s), "psl_median_db": float(np.median(vals)),
                    "psl_p10_db": float(np.percentile(vals, 10)),
                    "psl_p90_db": float(np.percentile(vals, 90))})
        print(f"  phase error {s:4.0f} deg rms: median PSL {np.median(vals):6.2f} dB")
    return out


def sweep(cfg, key, values, x_base):
    """Re-optimize with one setting changed; the baseline point reuses x_base."""
    out = []
    for v in values:
        c = replace(cfg, **{key: v})
        if key == "min_pitch_um":
            c = replace(c, max_pitch_um=v + (cfg.max_pitch_um - cfg.min_pitch_um))
        fine = c.u_grid(oversample=32)
        x = x_base if c == cfg else optimize_positions(replace(c, n_starts=cfg.sweep_starts))
        r = {key: v, "psl_opt_db": float(psl_db(x, c, fine)),
             "psl_random_median_db": float(np.median(random_psl(c)))}
        print(f"  {key} = {v}: optimized {r['psl_opt_db']:.2f} dB, "
              f"random median {r['psl_random_median_db']:.2f} dB")
        out.append(r)
    return out


def main():
    cfg = CFG
    fine = cfg.u_grid(oversample=32)

    print(f"Optimizing N = {cfg.n_emitters}, gaps {cfg.min_pitch_um}-{cfg.max_pitch_um} um ...")
    x_uni = uniform_positions(cfg)
    x_irr = optimize_positions(cfg)
    psl_uni = psl_db(x_uni, cfg, fine)
    psl_irr = psl_db(x_irr, cfg, fine)
    psl_rand = random_psl(cfg)
    print(f"  uniform {psl_uni:.2f} dB | random median {np.median(psl_rand):.2f} dB "
          f"| optimized {psl_irr:.2f} dB")

    fig_far_field(x_uni, x_irr, cfg)
    fig_psl_vs_steering(x_uni, x_irr, cfg)
    fig_steering_map(x_uni, x_irr, cfg)
    fig_positions(x_uni, x_irr, cfg)

    print("Phase-error tolerance ...")
    phase = phase_error_sweep(x_irr, cfg, np.arange(0, 61, 5))
    fig_phase_errors(phase, cfg)

    print("Trade-off sweeps ...")
    sweep_n = sweep(cfg, "n_emitters", [8, 16, 32, 64], x_irr)
    sweep_pitch = sweep(cfg, "min_pitch_um", [1.0, 1.5, 2.0, 2.5, 3.0], x_irr)
    fig_tradeoffs(sweep_n, sweep_pitch, cfg)

    gaps = np.diff(x_irr)
    results = {
        "config": {k: getattr(cfg, k) for k in cfg.__dataclass_fields__},
        "psl_uniform_db": float(psl_uni),
        "psl_random_median_db": float(np.median(psl_rand)),
        "psl_random_best_db": float(psl_rand.min()),
        "psl_optimized_db": float(psl_irr),
        "aperture_uniform_um": float(np.ptp(x_uni)),
        "aperture_irregular_um": float(np.ptp(x_irr)),
        "gap_min_um": float(gaps.min()), "gap_max_um": float(gaps.max()),
        "gap_mean_um": float(gaps.mean()),
        "beamwidth_uniform_deg": float(beamwidth_deg(x_uni, cfg)),
        "beamwidth_irregular_deg": float(beamwidth_deg(x_irr, cfg)),
        "positions_um": [round(float(v), 4) for v in x_irr - x_irr.min()],
        "phase_error_sweep": phase,
        "sweep_n_emitters": sweep_n,
        "sweep_min_pitch": sweep_pitch,
    }
    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    print(f"Wrote {RESULTS_PATH.name} and figures/")


if __name__ == "__main__":
    main()
