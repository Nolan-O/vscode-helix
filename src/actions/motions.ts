import * as vscode from 'vscode';

import { HelixState } from '../helix_state_types';
import { Mode } from '../modes';
import { Direction } from './actions';
import { searchBackward, searchForward } from '../search_utils';
import {
  vimToVscodeVisualLineSelection,
  vimToVscodeVisualSelection,
  vscodeToVimVisualLineSelection,
  vscodeToVimVisualSelection,
} from '../selection_utils';

type MotionArgs = {
  document: vscode.TextDocument;
  position: vscode.Position;
  selectionIndex: number;
  vimState: HelixState;
};

type Motion = (args: MotionArgs) => vscode.Position;
type MotionExecutor = (
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
) => vscode.Selection;
export type MotionWrapper = (vimState: HelixState, editor: vscode.TextEditor, ...args: any) => void;

function execNormalMotion(
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
) {
  const newPosition = motion({
    document: document,
    position: selection.active,
    selectionIndex: selectionIndex,
    vimState: vimState,
  });
  return new vscode.Selection(selection.active, newPosition);
}

function execVisualMotion(
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
  dir: Direction,
) {
  const vimSelection = vscodeToVimVisualSelection(document, selection, dir);
  const motionPosition = motion({
    document: document,
    position: vimSelection.active,
    selectionIndex: selectionIndex,
    vimState: vimState,
  });

  return vimToVscodeVisualSelection(document, new vscode.Selection(vimSelection.anchor, motionPosition), dir);
}
function execVisualMotionLeft(
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
) {
  return execVisualMotion(vimState, selection, selectionIndex, document, motion, Direction.Left);
}
function execVisualMotionRight(
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
) {
  return execVisualMotion(vimState, selection, selectionIndex, document, motion, Direction.Right);
}

function execVisualLineMotion(
  vimState: HelixState,
  selection: vscode.Selection,
  selectionIndex: number,
  document: vscode.TextDocument,
  motion: Motion,
) {
  const vimSelection = vscodeToVimVisualLineSelection(document, selection);
  const motionPosition = motion({
    document: document,
    position: vimSelection.active,
    selectionIndex: selectionIndex,
    vimState: vimState,
  });

  return vimToVscodeVisualLineSelection(document, new vscode.Selection(vimSelection.anchor, motionPosition));
}

function mapMotion(vimState: HelixState, editor: vscode.TextEditor, executor: MotionExecutor, motion: Motion) {
  const newSelections = editor.selections.map((selection, i) => {
    return executor(vimState, selection, i, editor.document, motion);
  });

  editor.selections = newSelections;

  editor.revealRange(
    new vscode.Range(newSelections[0].active, newSelections[0].active),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

export function execMotion(
  vimState: HelixState,
  editor: vscode.TextEditor,
  motion: Motion,
  dir: Direction | undefined,
) {
  const document = editor.document;

  let newSelections;
  if (vimState.mode === Mode.Normal) {
    newSelections = editor.selections.map((selection, i) => {
      return execNormalMotion(vimState, selection, i, document, motion);
    });
  } else if (vimState.mode === Mode.Visual) {
    if (dir === undefined) {
      console.warn('No direction specified for visual motion');
      return;
    }
    newSelections = editor.selections.map((selection, i) => {
      return execVisualMotion(vimState, selection, i, document, motion, dir);
    });
  } else if (vimState.mode === Mode.VisualLine) {
    newSelections = editor.selections.map((selection, i) => {
      return execVisualLineMotion(vimState, selection, i, document, motion);
    });
  } else {
    newSelections = editor.selections;
  }

  editor.selections = newSelections;

  editor.revealRange(
    new vscode.Range(newSelections[0].active, newSelections[0].active),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

export function findForward(vimState: HelixState, editor: vscode.TextEditor, str: string): void {
  mapMotion(vimState, editor, execVisualMotionRight, ({ vimState, position, document }) => {
    const fromPosition = position.with({ character: position.character });
    const result = searchForward(document, str, fromPosition);

    if (result) {
      return result.with({ character: result.character + 2 });
    } else {
      return position;
    }
  });
}

export function findBackward(vimState: HelixState, editor: vscode.TextEditor, str: string): void {
  mapMotion(vimState, editor, execVisualMotionLeft, ({ vimState, position, document }) => {
    const fromPosition = position.with({ character: position.character - 1 });
    const result = searchBackward(document, str, fromPosition);

    if (result) {
      return result.with({ character: result.character });
    } else {
      return position;
    }
  });
}

export const tillForward: MotionWrapper = function (
  vimState: HelixState,
  editor: vscode.TextEditor,
  str: string,
): void {
  mapMotion(vimState, editor, execVisualMotionRight, ({ vimState, position, document }) => {
    const fromPosition = position.with({ character: position.character + 1 });
    const result = searchForward(document, str, fromPosition);

    if (result) {
      return result.with({ character: result.character + 1 });
    } else {
      return position;
    }
  });
};

export const tillBackward: MotionWrapper = function (
  vimState: HelixState,
  editor: vscode.TextEditor,
  str: string,
): void {
  mapMotion(vimState, editor, execVisualMotionLeft, ({ vimState, position, document }) => {
    const fromPosition = position.with({ character: position.character - 2 });
    const result = searchBackward(document, str, fromPosition);

    if (result) {
      return result.with({ character: result.character + 1 });
    } else {
      return position;
    }
  });
};

function positionLeftWrap(document: vscode.TextDocument, position: vscode.Position): vscode.Position {
  if (position.character === 0) {
    if (position.line === 0) {
      return position;
    } else {
      const lineLength = document.lineAt(position.line - 1).text.length;
      return new vscode.Position(position.line - 1, lineLength);
    }
  } else {
    return position.with({ character: position.character - 1 });
  }
}

export function createWordForwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(
      vimState,
      editor,
      ({ document, position }) => {
        let character = position.character;
        // Try the current line and if we're at the end go to the next line
        // This way we're only keeping one line of text in memory at a time
        // i is representing the relative line number we're on from where we started
        for (let i = 0; i < document.lineCount; i++) {
          const lineText = document.lineAt(position.line + i).text;
          const ranges = wordRangesFunction(lineText);

          const result = ranges.find((x) => x.start > character);

          if (result) {
            return position.with({ character: result.start - 1, line: position.line + i });
          }
          // If we don't find anything on this line, search the next and reset the character to 0
          character = 0;
        }

        // We may be at the end of the document or nothing else matches
        return position;
      },
      Direction.Right,
    );
  };
}

export function createWordBackwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(
      vimState,
      editor,
      ({ document, position }) => {
        let character = position.character;
        // Try the current line and if we're at the end go to the next line
        // This way we're only keeping one line of text in memory at a time
        // i is representing the relative line number we're on from where we started
        for (let i = position.line; i >= 0; i--) {
          const lineText = document.lineAt(i).text;
          const ranges = wordRangesFunction(lineText);

          const result = ranges.reverse().find((x) => x.start < character);

          if (result) {
            return position.with({ character: result.start, line: i });
          }

          // If we don't find anything on this line, search the next and reset the character to 0
          character = Infinity;
        }
        // We may be at the end of the document or nothing else matches
        return position;
      },
      Direction.Left,
    );
  };
}

export function createWordEndHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
  direction: Direction,
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(
      vimState,
      editor,
      ({ document, position }) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = wordRangesFunction(lineText);

        const result = ranges.find((x) => x.end > position.character);

        if (result) {
          return position.with({ character: result.end + 1 });
        } else {
          return position;
        }
      },
      direction,
    );
  };
}
