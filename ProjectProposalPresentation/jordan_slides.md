# Jordan's slides: outcomes, preliminary results, risks, conclusion

These are slides 8–15 of `Alfieri_Harlow_Proposal_Presentation.pptx` (built by `build_slides.js`).
The deck has no speaker notes; the **Say** text below is the script.

8 slides, about 6 minutes. Figures are in `prelim/figures/`. Numbers come from `prelim/results.json`
(run `prelim/array_design.py`). Times assume about 135 spoken words per minute.

| # | Slide | Time |
|---|---|---|
| 1 | Tentative outcomes | 0:50 |
| 2 | Preliminary results: how we model the array | 0:50 |
| 3 | Result 1: grating lobe removed | 0:50 |
| 4 | Result 2: whole ±45° range | 0:40 |
| 5 | Result 3: design margin | 0:50 |
| 6 | Result 4: phase errors | 0:40 |
| 7 | Risk management | 0:45 |
| 8 | Conclusion | 0:35 |
| | **Total** | **~6:00** |

---

## Slide 1: Tentative outcomes (0:50)

**Title:** Deliverables, pass criteria and dates

| Deliverable | Pass criterion | Done by |
|---|---|---|
| O1: 32 emitter positions | All gaps ≥ 1.5 µm; every side lobe ≤ −10 dB over ±45°, using the FDTD emitter pattern | Oct. 25 |
| O2: Component library (S-parameters) | Neighbor crosstalk < −20 dB · 1×2 MMI loss < 0.3 dB · heater P<sub>π</sub> ≤ 25 mW, < 5 % on neighbor | Nov. 1 (M1) |
| O3: Full 1×32 circuit (INTERCONNECT) | Smooth steering across ±45°; calibration recovers the beam under fab variation | Nov. 8 / Nov. 15 (M2, M3) |
| O4: LiDAR estimate | Range resolution and maximum range from simulated loss and beam quality | Nov. 15 (M3) |
| O5: GDSII layout (stretch goal) | Zero DRC errors in the SiEPIC EBeam PDK; connectivity matches the O3 circuit | Nov. 15, if time allows |
| Final IEEE paper | Submitted | Nov. 30 (M5) |

**Footer line:** Simulation and design only: fabrication is out of scope this semester.

**Say:**
Thanks, Jacob. With those objectives, here is exactly what we'll hand in by November 30th, and every row has a number we can check. For O1, the array, that's 32 emitter positions with every gap at least 1.5 microns, and every side lobe at least 10 dB below the beam across plus or minus 45 degrees. O2 is the three components, each with a numeric target: crosstalk, splitter loss and heater power. O3 is the full 32-channel circuit steering smoothly, including fabrication variation and calibration. O4 turns the simulated loss and beam quality into a LiDAR range estimate, and O5, our stretch goal, is a mask layout with zero design-rule errors. The dates match the milestones in our weekly timeline.

---

## Slide 2: Preliminary results: how we model the array (0:50)

**Title:** Array-factor model and search setup

**On slide:**
- Far field of N emitters at positions x<sub>n</sub>:
  AF(θ) = (1/N) Σ<sub>n</sub> exp[ j (2π/λ) x<sub>n</sub> (sin θ − sin θ<sub>0</sub>) ]
- Steering to θ<sub>0</sub> only shifts the pattern → one check covers all of ±45°:
  worst side lobe for |sin θ − sin θ<sub>0</sub>| ≤ 1 + sin 45°
- Variables: the 31 gaps, each 1.5–4.0 µm
- Search: gradient-based, 30 random starts; about 1 min on a laptop
- Own Python code (NumPy/SciPy); ideal emitters for now
- Code: github.com/harlowjordan/ECE544-Project (links to `ProjectProposalPresentation/prelim`; full URL also on the References slide)

**Figure:** `emitter_positions.png` (bottom of slide)

**Say:**
I've already started on O1, so here's our model. The beam pattern of an array comes straight from the emitter positions and phases. That's the array factor on the slide. Steering doesn't change the pattern; it only slides which part of it we see. So instead of checking every steering angle separately, we check one window that covers all of them. The design variables are the 31 gaps between emitters, each between 1.5 and 4 microns. We minimize the worst side lobe with a gradient-based search from 30 random starting points. It's our own Python code and runs in about a minute. The strip at the bottom is the result: our irregular array next to a uniform one.

---

## Slide 3: Result 1: grating lobe removed (0:50)

**Title:** Far field at 30° steering, N = 32

**Figure:** `far_field_uniform_vs_irregular.png`

**Three numbers (worst side lobe over ±45°, N = 32, all gaps ≥ 1.5 µm):**
- Uniform 1.5 µm: **0 dB**
- Random gaps: **−7.2 dB** (median of 300)
- Optimized gaps: **−12.6 dB** (target −10 dB)

**Say:**
Here is the first result. Both arrays are steered to 30 degrees. On top is a uniform array at 1.5 microns. Because it's periodic, it makes a second beam at minus 32 degrees that is just as bright as the real one. That's a grating lobe, and the LiDAR couldn't tell which beam an echo came from. On the bottom is our optimized array with the same minimum spacing: one beam, with the leftover energy spread into a low floor. In numbers, uniform is 0 dB, random gaps give minus 7.2, and optimized gaps give minus 12.6. That beats our target by 2.6 dB.

---

## Slide 4: Result 2: whole ±45° range (0:40)

**Title:** Worst side lobe vs. steering angle

**Figure:** `psl_vs_steering.png` (or `steering_map.png` for a more visual version)

**On slide:**
- Uniform: meets −10 dB only within ±0.5° of broadside
- Optimized: −12.6 dB at every angle
- Wider aperture (88 vs. 46 µm) → narrower beam: 0.86° vs. 1.64°

**Say:**
That was one angle. This plot shows the worst side lobe at every steering angle. The orange uniform array only meets the target within half a degree of straight ahead. Past about 2 degrees, the grating lobe is as strong as the beam. The blue optimized array stays at minus 12.6 dB across the whole range, which is the window argument from before. There's also a bonus: the irregular array is 88 microns wide instead of 46, so its beam is about half as wide, 0.86 degrees.

---

## Slide 5: Result 3: design margin (0:50)

**Title:** Worst side lobe vs. emitter count and gap

**Figure:** `psl_tradeoffs.png`

**On slide:**
- More emitters → lower side lobes; **1×16 reaches only ≈ −10 dB** (no margin)
- Wider gaps cost little: **3 µm still gives −11.4 dB**
- Optimizing the gaps is worth about 5 dB over random

**Say:**
Next we asked how much margin we have if the design has to change. On the left we vary the number of emitters. More emitters means lower side lobes. 64 reaches minus 15 dB, but 16 only reaches about minus 10. So our 1-by-16 fallback would only just meet the target. On the right we keep 32 emitters and widen the minimum gap. Even at 3 microns we still get minus 11.4 dB. That means if Jacob finds 1.5 microns is too tight for crosstalk, we can space the emitters out and still pass. The gray line is random gaps, so optimizing is worth about 5 dB.

---

## Slide 6: Result 4: phase errors (0:40)

**Title:** Worst side lobe vs. random phase error

**Figure:** `phase_error_tolerance.png`

**On slide:**
- Random phase error on every emitter, 300 trials per point
- Target holds only below **≈ 15° rms**
- → O3 calibration must leave < 15° rms residual error

**Say:**
So far every emitter has exactly the right phase, and a real chip won't. Here we added random phase errors to every emitter, 300 trials per point. The side lobes rise steadily, and the target holds only while the error stays below about 15 degrees rms. Uncorrected fabrication errors can be much larger than that, which is why O3 includes calibration with the heaters. This plot also gives that calibration a pass criterion: under 15 degrees of leftover error.

---

## Slide 7: Risk management (0:45)

**Title:** Risks, fallback plans and evidence

| Risk | Plan B | Evidence |
|---|---|---|
| Real emitter pattern pushes side lobes above −10 dB | Re-optimize with the FDTD pattern; otherwise report the level we reach | 2.6 dB margin (slide 3) |
| Crosstalk at 1.5 µm worse than −20 dB | Widen the minimum gap | 3 µm → −11.4 dB (slide 5) |
| Fabrication variation scrambles phases | Heater calibration in O3 | Need < 15° rms (slide 6) |
| 1×32 too big for the time left | Fall back to 1×16, with a relaxed side-lobe spec | 1×16 ≈ −10 dB (slide 5) |
| 3-D FDTD too slow | Simulate short sections; 2.5-D solvers | |
| Schedule slip | Technical work ends Nov. 15; week of Nov. 23 is buffer | |

**Say:**
Putting that together, here's our risk plan. The biggest unknown is the real emitter pattern. Our 2.6 dB margin gives us room, and if we still miss, we report the level we actually reach. If crosstalk forces wider spacing, we just saw that still works. Fabrication variation is handled by calibration, with that 15-degree requirement. If 32 channels is too much, we drop to 16, knowing that means relaxing the side-lobe spec. Slow 3-D simulations get split into short sections or 2.5-D solvers. And technical work ends November 15th, leaving a buffer week before the deadline.

---

## Slide 8: Conclusion (0:35)

**Title:** Summary and next steps

- **Problem:** wide steering needs < 0.9 µm emitter pitch, where crosstalk distorts the beam; at a safe 1.5 µm, a uniform array steers only ±2°.
- **Approach:** irregular 1×32 OPA, all gaps ≥ 1.5 µm, on 220-nm SOI; simulated from components to the full circuit.
- **First result:** −12.6 dB worst side lobe over ±45° with ideal emitters (target −10 dB).
- **Next:** FDTD emitter pattern → components → full circuit → LiDAR estimate; final paper Nov. 30.

**Say:**
To wrap up: steering plus or minus 45 degrees normally needs emitters under 0.9 microns apart, which is where crosstalk ruins the beam. We keep every gap at least 1.5 microns and make the spacing irregular instead. Our first results already beat the side-lobe target over the whole range. Next we add the real emitter pattern from FDTD, then build the components and the full circuit, for November 30th. Thank you, and we're happy to take questions.
