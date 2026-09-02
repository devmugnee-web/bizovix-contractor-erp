export type ManufacturingNavigationView = {
  id: string;
};

export type ManufacturingNavigationGroup<
  TView extends ManufacturingNavigationView = ManufacturingNavigationView,
> = {
  id: string;
  views: readonly TView[];
};

export type VisibleManufacturingNavigationView<
  TView extends ManufacturingNavigationView,
> = TView & {
  /** Stable one-based position in the complete, unfiltered A-to-K catalog. */
  flowSerial: number;
  /** The company hid this step, but an active-run safety rule exposed it. */
  forcedVisible: boolean;
  /** The company preference contains this serial, irrespective of forcing. */
  configuredHidden: boolean;
  /** Every configured step was hidden, so this is the navigation escape hatch. */
  safetyFallback: boolean;
};

export type VisibleManufacturingNavigationGroup<
  TGroup extends ManufacturingNavigationGroup,
> = Omit<TGroup, "views"> & {
  views: Array<VisibleManufacturingNavigationView<TGroup["views"][number]>>;
};

export type ManufacturingNavigationVisibilityOptions = {
  hiddenFlowSerials?: Iterable<number>;
  forcedVisibleFlowSerials?: Iterable<number>;
  /**
   * Defaults to true so a malformed/all-off preference can never leave the
   * Manufacturing workspace without a valid route target.
   */
  ensureAtLeastOneVisible?: boolean;
};

export type ManufacturingNavigationTarget = {
  section: string;
  view: string;
  flowSerial: number;
};

function normalizedSerials(values: Iterable<number> | undefined) {
  return new Set(
    Array.from(values ?? []).filter(
      (value) => Number.isSafeInteger(value) && value > 0,
    ),
  );
}

/**
 * Applies a presentation-only visibility profile to the complete catalog.
 * Global serials are assigned before filtering and therefore never shift when
 * an earlier group or step is hidden.
 */
export function deriveVisibleManufacturingNavigation<
  TGroup extends ManufacturingNavigationGroup,
>(
  catalogGroups: readonly TGroup[],
  options: ManufacturingNavigationVisibilityOptions = {},
): Array<VisibleManufacturingNavigationGroup<TGroup>> {
  const hidden = normalizedSerials(options.hiddenFlowSerials);
  const forced = normalizedSerials(options.forcedVisibleFlowSerials);
  let flowSerial = 0;

  const indexed: Array<VisibleManufacturingNavigationGroup<TGroup>> =
    catalogGroups.map((group) => {
      const views: Array<
        VisibleManufacturingNavigationView<TGroup["views"][number]>
      > = group.views.map((view) => {
        flowSerial += 1;
        const configuredHidden = hidden.has(flowSerial);
        return {
          ...view,
          flowSerial,
          configuredHidden,
          forcedVisible: configuredHidden && forced.has(flowSerial),
          safetyFallback: false,
        };
      });
      return { ...group, views } as VisibleManufacturingNavigationGroup<TGroup>;
    });

  const visible: Array<VisibleManufacturingNavigationGroup<TGroup>> = indexed
    .map((group) => ({
      ...group,
      views: group.views.filter(
        (view) => !view.configuredHidden || view.forcedVisible,
      ),
    }))
    .filter((group) => group.views.length > 0);

  if (
    visible.length ||
    options.ensureAtLeastOneVisible === false ||
    !indexed[0]?.views[0]
  ) {
    return visible;
  }

  const firstGroup = indexed[0];
  const firstView = firstGroup.views[0];
  return [
    {
      ...firstGroup,
      views: [{ ...firstView, safetyFallback: true }],
    },
  ] as Array<VisibleManufacturingNavigationGroup<TGroup>>;
}

/**
 * Resolves a requested route against an already-visible catalog. A hidden
 * current view falls back to the first visible view in its group, then to the
 * first visible catalog target.
 */
export function resolveVisibleManufacturingNavigationTarget<
  TGroup extends {
    id: string;
    views: ReadonlyArray<{ id: string; flowSerial: number }>;
  },
>(
  visibleGroups: readonly TGroup[],
  requested?: { section?: string | null; view?: string | null },
): ManufacturingNavigationTarget | null {
  const requestedGroup = requested?.section
    ? visibleGroups.find((group) => group.id === requested.section)
    : undefined;
  const requestedView = requestedGroup?.views.find(
    (view) => view.id === requested?.view,
  );
  const target =
    requestedView ?? requestedGroup?.views[0] ?? visibleGroups[0]?.views[0];
  const section = requestedView
    ? requestedGroup?.id
    : requestedGroup?.views[0] === target
      ? requestedGroup.id
      : visibleGroups[0]?.id;

  return target && section
    ? { section, view: target.id, flowSerial: target.flowSerial }
    : null;
}
