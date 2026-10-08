/**
 * ArcLayer that draws each arc in over time instead of popping it into
 * existence.
 *
 * deck.gl's stock ArcLayer has no draw-in animation (PLAN.md 1.1): an arc
 * either exists or it doesn't. Rather than animate layer props from React -
 * which would mean one layer per arc and a re-render every frame - this
 * subclass gives every arc a per-instance `startTime` attribute and clips the
 * geometry in the fragment shader against a shared clock. The cost is flat:
 * a thousand arcs render in one draw call, same as one.
 *
 * The same mechanism covers all three cases the installation needs:
 *   - new submission   -> startTime = now            -> draws in
 *   - hydrated backlog -> startTime far in the past  -> already complete
 *   - repeat city      -> reset startTime to now     -> replays
 */
import { ArcLayer } from '@deck.gl/layers';
import type { ArcLayerProps } from '@deck.gl/layers';
import type { Accessor, UpdateParameters } from '@deck.gl/core';

/**
 * Epoch ms does not survive a float32 uniform: ~1.79e12 exceeds the 2^24 range
 * where float32 represents integers exactly, which would quantise the clock
 * into ~4-minute steps and freeze the animation outright. So the shader clock
 * runs in SECONDS SINCE PAGE LOAD (performance.now), where values stay small
 * enough to keep sub-millisecond resolution for far longer than any event.
 *
 * Callers convert wall-clock submission times into this frame with
 * `toSceneTime` below.
 */
export function sceneNow(): number {
  return performance.now() / 1000;
}

/** Convert a wall-clock epoch-ms timestamp into the shader's scene clock. */
export function toSceneTime(epochMs: number): number {
  return sceneNow() - (Date.now() - epochMs) / 1000;
}

/** A start time far enough in the past that the arc renders fully drawn. */
export const ALREADY_SETTLED = -1e6;

const uniformBlock = `\
layout(std140) uniform animatedArcUniforms {
  float currentTime;
  float drawDuration;
} animatedArc;
`;

type AnimatedArcUniforms = {
  currentTime: number;
  drawDuration: number;
};

const animatedArcUniformBlock = {
  name: 'animatedArc',
  vs: uniformBlock,
  uniformTypes: {
    currentTime: 'f32',
    drawDuration: 'f32',
  },
} as const;

export type AnimatedArcLayerProps<DataT = unknown> = ArcLayerProps<DataT> & {
  /** Scene-clock time (see sceneNow) at which this arc starts drawing. */
  getStartTime?: Accessor<DataT, number>;
  /** How long one arc takes to draw itself, in milliseconds. */
  drawDurationMs?: number;
};

export default class AnimatedArcLayer<DataT = unknown> extends ArcLayer<
  DataT,
  Required<AnimatedArcLayerProps<DataT>>
> {
  static layerName = 'AnimatedArcLayer';

  static defaultProps = {
    ...ArcLayer.defaultProps,
    getStartTime: { type: 'accessor', value: 0 },
    drawDurationMs: { type: 'number', value: 2600 },
    /**
     * An arc is a triangle strip whose winding depends on which way it
     * travels, so under back-face culling it doesn't degrade - it disappears
     * outright, with no error and no warning. A flat MapView doesn't cull, so
     * this is a no-op here; it is kept so the layer stays safe to drop into a
     * GlobeView, which does.
     */
    parameters: { cullMode: 'none' as const },
  };

  /** Scene time after which nothing is moving, so we can stop redrawing. */
  state!: ArcLayer<DataT>['state'] & { animatesUntil: number };

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, animatedArcUniformBlock],
      inject: {
        'vs:#decl': `
in float instanceStartTime;
out float vProgress;
`,
        // segmentRatio is already published to the fragment shader as uv.x, so
        // only the per-instance progress needs carrying across.
        'vs:#main-end': `
  vProgress = clamp(
    (animatedArc.currentTime - instanceStartTime) / animatedArc.drawDuration,
    0.0,
    1.0
  );
`,
        'fs:#decl': `
in float vProgress;
`,
        // uv.x is the position along the arc, 0 at the origin city and 1 at the
        // destination. Everything ahead of the travelling tip is discarded.
        'fs:#main-start': `
  if (uv.x > vProgress) discard;
`,
        // A bright head at the leading tip reads as something in flight rather
        // than a bar wipe. It fades out as the arc settles into the web.
        'fs:#main-end': `
  float distanceBehindTip = vProgress - uv.x;
  float head = exp(-distanceBehindTip * 36.0) * step(vProgress, 0.999);
  fragColor.rgb = mix(fragColor.rgb, vec3(1.0), head * 0.8);
  fragColor.a = max(fragColor.a, head);
`,
      },
    };
  }

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceStartTime: {
        size: 1,
        accessor: 'getStartTime',
        defaultValue: 0,
      },
    });
    this.state.animatesUntil = 0;
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);

    // Work out when the last arc finishes so draw() can stop asking for frames
    // once the map is static. A projection left running all day shouldn't burn
    // a GPU core redrawing an unchanging image.
    const { changeFlags } = params;
    if (changeFlags.dataChanged || changeFlags.updateTriggersChanged) {
      const { data, getStartTime, drawDurationMs } = this.props;
      let latest = -Infinity;
      const rows = data as Iterable<DataT>;
      if (rows) {
        for (const row of rows) {
          const start =
            typeof getStartTime === 'function'
              ? getStartTime(row, { index: -1, data: rows, target: [] })
              : (getStartTime as unknown as number);
          if (start > latest) latest = start;
        }
      }
      this.state.animatesUntil =
        latest === -Infinity ? 0 : latest + drawDurationMs / 1000;
    }
  }

  draw(params: Parameters<ArcLayer<DataT>['draw']>[0]) {
    const now = sceneNow();

    const model = this.state.model;
    model?.shaderInputs.setProps({
      animatedArc: {
        currentTime: now,
        drawDuration: this.props.drawDurationMs / 1000,
      } satisfies AnimatedArcUniforms,
    });

    super.draw(params);

    // Keep the frames coming only while something is still drawing.
    if (now < this.state.animatesUntil) {
      this.setNeedsRedraw();
    }
  }
}
