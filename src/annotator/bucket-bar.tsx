import { render } from 'preact';

import type { AnchorPosition, Destroyable } from '../types/annotator';
import Buckets from './components/Buckets';
import { computeBuckets } from './util/buckets';

export type BucketBarOptions = {
  onFocusAnnotations: (tags: string[]) => void;
  onScrollToClosestOffScreenAnchor: (
    tags: string[],
    direction: 'down' | 'up'
  ) => void;
  onSelectAnnotations: (tags: string[], toggle: boolean) => void;
};

/**
 * Controller for the "bucket bar" shown alongside the sidebar indicating where
 * annotations are in the document.
 */
export class BucketBar implements Destroyable {
  private _bucketsContainer: HTMLDivElement;
  private _onFocusAnnotations: BucketBarOptions['onFocusAnnotations'];
  private _onScrollToClosestOffScreenAnchor: BucketBarOptions['onScrollToClosestOffScreenAnchor'];
  private _onSelectAnnotations: BucketBarOptions['onSelectAnnotations'];

  constructor(
    container: HTMLElement,
    {
      onFocusAnnotations,
      onScrollToClosestOffScreenAnchor,
      onSelectAnnotations,
    }: BucketBarOptions
  ) {
    this._bucketsContainer = document.createElement('div');
    container.appendChild(this._bucketsContainer);

    this._onFocusAnnotations = onFocusAnnotations;
    this._onScrollToClosestOffScreenAnchor = onScrollToClosestOffScreenAnchor;
    this._onSelectAnnotations = onSelectAnnotations;

    // Immediately render the bucket bar
    this.update([]);
  }

  destroy() {
    render(null, this._bucketsContainer);
    this._bucketsContainer.remove();
  }

  update(positions: AnchorPosition[]) {
    const buckets = computeBuckets(positions);
    render(
      <Buckets
        above={buckets.above}
        below={buckets.below}
        buckets={buckets.buckets}
        onFocusAnnotations={tags => this._onFocusAnnotations(tags)}
        onScrollToClosestOffScreenAnchor={(tags, direction) =>
          this._onScrollToClosestOffScreenAnchor(tags, direction)
        }
        onSelectAnnotations={(tags, toogle) =>
          this._onSelectAnnotations(tags, toogle)
        }
      />,
      this._bucketsContainer
    );
  }
}
