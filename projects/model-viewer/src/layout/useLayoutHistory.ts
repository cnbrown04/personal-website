import { useCallback, useMemo } from "react";
import type { Params } from "../types";
import {
  dedupeFills,
  type Fill,
  fillsFromParams,
  fillsToParam,
  type Tool,
  toolsFromParams,
  toolsToParam,
} from "./inserts";
import * as L from "./model";

/** Everything the in-viewport editor changes, as one undoable document. */
export interface EditDoc {
  layout: L.Layout;
  fills: Fill[];
  tools: Tool[];
}

export type EditPatch = Partial<EditDoc>;

function docToParams(doc: EditDoc, withInserts: boolean): Params {
  return withInserts
    ? { ...L.toParams(doc.layout), fills: fillsToParam(doc.fills), tools: toolsToParam(doc.tools) }
    : L.toParams(doc.layout);
}

/** Current layout + inserts from the parameters, with a commit that normalizes edits. Undo lives in useParamHistory. */
export function useLayoutHistory(
  params: Params,
  apply: (patch: Params) => void,
  withInserts: boolean,
) {
  const key = JSON.stringify([
    params.col_splits,
    params.row_splits,
    params.cells,
    params.fills,
    params.tools,
  ]);
  const doc = useMemo<EditDoc>(
    () => ({
      layout: L.fromParams(params),
      fills: fillsFromParams(params),
      tools: toolsFromParams(params),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const commit = useCallback(
    (patch: EditPatch) => {
      const layout = L.normalize(patch.layout ?? doc.layout);
      const next: EditDoc = {
        layout,
        fills: dedupeFills(layout, patch.fills ?? doc.fills),
        tools: patch.tools ?? doc.tools,
      };
      const nextParams = docToParams(next, withInserts);
      if (JSON.stringify(nextParams) === JSON.stringify(docToParams(doc, withInserts)))
        return false;
      apply(nextParams);
      return true;
    },
    [doc, apply, withInserts],
  );

  return { ...doc, doc, commit };
}
