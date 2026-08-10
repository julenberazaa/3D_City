# PROVENANCE — provenance classes and policy

## Classes
- **OBSERVED**: directly present in an authoritative/open dataset (footprint, height,
  road geometry, roof shape, surface, terrain elevation).
- **DERIVED**: deterministically calculated from observed data (e.g., facade floor bands
  from known floor count).
- **INFERRED**: deterministic fallback because source evidence is missing (e.g., neutral
  roof type when no roof type exists).

## Policy
1. Pipeline attributes carry a provenance tag; never present INFERRED as OBSERVED.
2. Debug overlay may show per-feature provenance/confidence.
3. Deterministic hash-based procedural variation is allowed but tagged INFERRED.
4. This file also tracks every reusable code source entering the product:
   project name, canonical URL, version/commit, license, attribution, what we use,
   copied/adapted/translated/referenced, compatibility, limitations.

## Code/asset provenance ledger (fill as components enter)

| Component | Source | URL/version | License | Use mode | Notes |
|---|---|---|---|---|---|
| (pending audit WP-01) | | | | | |
