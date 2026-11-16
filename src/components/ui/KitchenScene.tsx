import React from 'react';

/**
 * A CSS-only kitchen still life: tiled splashback, window onto rolling hills,
 * a shelf of jars, a counter with a chopping board, mug and plant.
 *
 * Deliberately drawn in flat, muted greys-greens with hairline strokes rather
 * than chunky 2.5D gradients — it is scenery, not a toy.
 */
export const KitchenScene: React.FC<{ note?: string; className?: string }> = ({
  note = 'a pinch of possibility.',
  className = '',
}) => (
  <div className={`kitchen-scene ${className}`} aria-hidden="true">
    <div className="scene-sun" />
    <div className="scene-tiles" />

    {/* window */}
    <div className="scene-window">
      <div className="scene-window-sky">
        <span className="scene-hill h2" />
        <span className="scene-hill h1" />
        <span className="scene-cloud" />
      </div>
      <span className="scene-window-v" />
      <span className="scene-window-h" />
      <span className="scene-sill" />
    </div>

    {/* hanging utensils */}
    <div className="scene-hang h1" />
    <div className="scene-hang h2" />
    <div className="scene-hang h3" />

    {/* shelf with jars */}
    <div className="scene-shelf">
      <div className="scene-jar j1">
        <span>flour</span>
      </div>
      <div className="scene-jar j2">
        <span>ideas</span>
      </div>
      <div className="scene-jar j3" />
    </div>

    {/* counter */}
    <div className="scene-counter" />
    <div className="scene-board" />
    <div className="scene-plant" />
    <div className="scene-mug">
      <span className="scene-steam s1" />
      <span className="scene-steam s2" />
    </div>
    <div className="scene-note">{note}</div>
  </div>
);

export default KitchenScene;
