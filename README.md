# Pelagos — Planet Laboratory

A browser app for exploring the geology and climate of island planets. Built with vanilla JavaScript and Canvas; no dependencies or build step.

Maps now use a 960 × 480 terrain grid (16 times the original sample count), with shaded relief, narrow plate seams, and detailed coastal shelves. The globe renders at the display's pixel density with interpolated texture sampling, directional lighting, and an atmospheric rim. Planet calculations run in a background worker to keep controls responsive; slow browsers may update the detailed map less frequently during playback.

## Run

Install Node.js, then run `npm start` in this directory. Open http://localhost:5173. Run `npm test` for model checks.

## Explore

- Start with Archipelago, Continental, Volcanic ocean, or Frozen islands.
- Adjust plate count and speed, fragmentation, sea level, volcanic activity, and planet age.
- Change reference temperature, atmospheric pressure, axial tilt, and day length.
- Compare surface, tectonics, temperature, rainfall, and crust-age maps in atlas or globe view.
- Use Elevation to see mountain height and ocean depth; use Uplift to distinguish tectonic uplift (gold) from subsidence (blue). Advance 25 million years with the geology experiment button to see formations emerge. The map labels major mountain belts, island arcs, trenches, and spreading ridges; the location explorer reports formation type and tectonic height change.
- Click the map to inspect local conditions. Rotate the globe to reach the other hemisphere.
- Explore Rivers, Erosion, and Currents. River overlays trace runoff channels; Erosion distinguishes carving from downstream sediment deposition. Ocean currents animate independently of geological playback and can also be overlaid on other maps. Adjust Erosion strength and Ocean circulation to compare scenarios.
- Play up to 1,000 million years, or scrub the timeline. Space toggles playback.
- Export a JSON experiment and restore it using Import in About the model, or paste the exported JSON into the alternative restore box. Nothing is sent to a backend.

Temperature is a reference climate setting, not a forced global mean. Geological time, planet age, and crust age are separate quantities. Climate layers estimate long-term conditions, not daily weather. Changing tilt affects local seasonal temperature range; day length affects the rainfall heuristic.

Collision relief starts at zero and grows with accumulated plate closure. Seeded plate-scale crust buoyancy distinguishes continental collisions from subduction. Continental collisions build fold mountains even with volcanism turned off; subduction produces an ocean trench and an offset volcanic arc. Divergence raises ocean ridges or opens continental rift valleys. Three historical samples carry earlier relief with its plate, producing remnants as boundaries move. These are deterministic formation heuristics, not a full crust deformation or mass conservation solver. Uplift reports deformation relative to the moving baseline terrain, rather than total change from the starting map. Terrain elevation feeds back into temperature, rainfall, coastlines, and island counts.

## Model and limitations

The 960 × 480 grid samples an Earth-sized sphere. Spherical Voronoi plates rotate about fixed Euler poles, carrying deterministic 3D procedural terrain. Relative plate velocity classifies boundaries. Heuristics approximate uplift, ridges, volcanic arcs, cooling, temperature, rainfall, and seasonal variation. Distance inland reduces moisture and increases seasonal variation, so small islands behave differently from continental interiors. Surface statistics use cosine latitude area weights, and connected land wraps across the longitude seam.

This is an exploratory worldbuilding model, not a validated planetary simulator. Plate identities stay fixed; no mantle convection, conserved crust generation/subduction or atmospheric/ocean fluid equations are solved. Plate boundaries may introduce abrupt terrain changes. Island counts depend on resolution and omit sub-grid islands. The geographic atlas exaggerates polar area; displayed coverage uses spherical weights. The fixed 5,000 km marker is an approximate reference, at the equator.

Conceptual background: [USGS plate motion](https://pubs.usgs.gov/gip/dynamic/understanding.html) and [NASA ocean and climate](https://science.nasa.gov/earth/climate-change/ocean-and-climate/). Parameters and equations are sandbox heuristics, not calibrations derived from these sources.

Google Fonts is an optional network request for typography; offline system fallbacks work. The app otherwise runs locally.



Rivers follow eight-neighbor downhill drainage. Closed basins remain closed. Runoff estimates use rainfall and spherical cell area. Slope, runoff, elapsed time, and erosion strength control carving; sediment moves downstream and is deposited in basins and coastal shelf fans. The erosion/deposition step conserves removed volume with latitude weighting, but is an equilibrium heuristic rather than an incremental sediment or lake-level solver. River routing is recomputed after terrain changes; line widths are exaggerated for visibility. Very small island rivers are below the grid resolution.

Surface-current vectors are a wind-band and gyre illustration with coastal steering, not a numerical fluid model. Their animation clock is separate from the geological timeline, and flow strength is relative. They currently do not advect heat into climate calculations. Older version 1 exports are supported; missing erosion and circulation settings receive the defaults.
