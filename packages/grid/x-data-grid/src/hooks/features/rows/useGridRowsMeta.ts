import * as React from 'react';
import { GridApiCommunity } from '../../../models/api/gridApiCommunity';
import { GridRowsMetaApi } from '../../../models/api/gridRowsMetaApi';
import { DataGridProcessedProps } from '../../../models/props/DataGridProps';
import { useGridVisibleRows } from '../../utils/useGridVisibleRows';
import { useGridApiMethod } from '../../utils/useGridApiMethod';
import { GridRowId } from '../../../models/gridRows';
import { useGridSelector } from '../../utils/useGridSelector';
import {
  gridDensityRowHeightSelector,
  gridDensityFactorSelector,
} from '../density/densitySelector';
import { gridFilterStateSelector } from '../filter/gridFilterSelector';
import { gridPaginationSelector } from '../pagination/gridPaginationSelector';
import { gridSortingStateSelector } from '../sorting/gridSortingSelector';
import { GridStateInitializer } from '../../utils/useGridInitializeState';
import { useGridRegisterPipeApplier } from '../../core/pipeProcessing';

export const rowsMetaStateInitializer: GridStateInitializer = (state) => ({
  ...state,
  rowsMeta: {
    currentPageTotalHeight: 0,
    positions: [],
  },
});

/**
 * @requires useGridPageSize (method)
 * @requires useGridPage (method)
 */
export const useGridRowsMeta = (
  apiRef: React.MutableRefObject<GridApiCommunity>,
  props: Pick<
    DataGridProcessedProps,
    'getRowHeight' | 'getRowSpacing' | 'pagination' | 'paginationMode'
  >,
): void => {
  const { getRowHeight, getRowSpacing } = props;
  const rowsHeightLookup = React.useRef<{
    [key: GridRowId]: { value: number; isResized: boolean; sizes: Record<string, number> };
  }>({});
  const rowHeight = useGridSelector(apiRef, gridDensityRowHeightSelector);
  const filterState = useGridSelector(apiRef, gridFilterStateSelector);
  const paginationState = useGridSelector(apiRef, gridPaginationSelector);
  const sortingState = useGridSelector(apiRef, gridSortingStateSelector);
  const currentPage = useGridVisibleRows(apiRef, props);

  const hydrateRowsMeta = React.useCallback(() => {
    apiRef.current.setState((state) => {
      const positions: number[] = [];
      const densityFactor = gridDensityFactorSelector(state, apiRef.current.instanceId);
      const currentRowHeight = gridDensityRowHeightSelector(state, apiRef.current.instanceId);
      const currentPageTotalHeight = currentPage.rows.reduce((acc: number, row) => {
        positions.push(acc);
        let baseRowHeight: number;

        const isResized =
          (rowsHeightLookup.current[row.id] && rowsHeightLookup.current[row.id].isResized) || false;

        if (isResized) {
          // do not recalculate resized row height and use the value from the lookup
          baseRowHeight = rowsHeightLookup.current[row.id].value;
        } else {
          baseRowHeight = currentRowHeight;

          if (getRowHeight) {
            // Default back to base rowHeight if getRowHeight returns null or undefined.
            baseRowHeight = getRowHeight({ ...row, densityFactor }) ?? currentRowHeight;
          }
        }

        // We use an object to make simple to check if a height is already added or not
        const initialHeights: Record<string, number> = { base: baseRowHeight };

        if (getRowSpacing) {
          const indexRelativeToCurrentPage = apiRef.current.getRowIndexRelativeToVisibleRows(
            row.id,
          );

          const spacing = getRowSpacing({
            ...row,
            isFirstVisible: indexRelativeToCurrentPage === 0,
            isLastVisible: indexRelativeToCurrentPage === currentPage.rows.length - 1,
            indexRelativeToCurrentPage,
          });

          initialHeights.spacingTop = spacing.top ?? 0;
          initialHeights.spacingBottom = spacing.bottom ?? 0;
        }

        const sizes = apiRef.current.unstable_applyPipeProcessors(
          'rowHeight',
          initialHeights,
          row,
        ) as Record<string, number>;

        const finalRowHeight = Object.values(sizes).reduce((acc2, value) => acc2 + value, 0);

        rowsHeightLookup.current[row.id] = {
          value: baseRowHeight,
          sizes,
          isResized,
        };

        return acc + finalRowHeight;
      }, 0);

      return {
        ...state,
        rowsMeta: { currentPageTotalHeight, positions },
      };
    });
    apiRef.current.forceUpdate();
  }, [apiRef, currentPage.rows, getRowSpacing, getRowHeight]);

  const getTargetRowHeight = (rowId: GridRowId): number =>
    rowsHeightLookup.current[rowId]?.value || rowHeight;

  const getRowInternalSizes = (rowId: GridRowId): Record<string, number> | undefined =>
    rowsHeightLookup.current[rowId]?.sizes;

  const setRowHeight = React.useCallback<GridRowsMetaApi['unstable_setRowHeight']>(
    (id: GridRowId, height: number) => {
      rowsHeightLookup.current[id] = {
        value: height,
        isResized: true,
        sizes: { ...rowsHeightLookup.current[id].sizes, base: height },
      };
      hydrateRowsMeta();
    },
    [hydrateRowsMeta],
  );

  // The effect is used to build the rows meta data - currentPageTotalHeight and positions.
  // Because of variable row height this is needed for the virtualization
  React.useEffect(() => {
    hydrateRowsMeta();
  }, [rowHeight, filterState, paginationState, sortingState, hydrateRowsMeta]);

  useGridRegisterPipeApplier(apiRef, 'rowHeight', hydrateRowsMeta);

  const rowsMetaApi: GridRowsMetaApi = {
    unstable_getRowHeight: getTargetRowHeight,
    unstable_getRowInternalSizes: getRowInternalSizes,
    unstable_setRowHeight: setRowHeight,
  };

  useGridApiMethod(apiRef, rowsMetaApi, 'GridRowsMetaApi');
};
