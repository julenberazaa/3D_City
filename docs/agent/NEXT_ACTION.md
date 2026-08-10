# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-06 world chunk streamer
CURRENT WORK PACKAGE: WP-06
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Implement the chunk streamer: split the world into per-chunk generation units (terrain/roads/buildings/physics per z15 chunk), a chunk lifecycle manager with priority (distance+heading+velocity), cancellation, bounded queues, and a streamed play area that grows/shrinks around the player — replacing the load-all-fixture boot.
WHY IT IS NEXT: P0 requires streaming (R-014); the live pipeline (WP-05) already fetches per-chunk sources, so WP-06 builds the lifecycle on top of it.
ACCEPTANCE CONDITION: unit tests for lifecycle/priority/cancellation; e2e drives across ≥2 chunk boundaries in a live or fixture streamed world; bounded queue assertions.
EVIDENCE TO PRODUCE: streaming unit tests green; streamed e2e screenshot; queue/cancellation counters.
