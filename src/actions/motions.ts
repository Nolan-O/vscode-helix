import * as vscode from 'vscode';

import { HelixState } from '../helix_state_types';
import { Mode } from '../modes_types';
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

type RegexMotionArgs = {
  document: vscode.TextDocument;
  position: vscode.Position;
  selectionIndex: number;
  vimState: HelixState;
  match: RegExpMatchArray;
};

function execRegexMotion(
  vimState: HelixState,
  editor: vscode.TextEditor,
  match: RegExpMatchArray,
  regexMotion: (args: RegexMotionArgs) => vscode.Position,
) {
  return execMotion(vimState, editor, (motionArgs) => {
    return regexMotion({
      ...motionArgs,
      match: match,
    });
  });
}

export function execMotion(vimState: HelixState, editor: vscode.TextEditor, motion: (args: MotionArgs) => vscode.Position) {
  const document = editor.document;

  const newSelections = editor.selections.map((selection, i) => {
    if (vimState.mode === Mode.Normal) {
      const newPosition = motion({
        document: document,
        position: selection.active,
        selectionIndex: i,
        vimState: vimState,
      });
      return new vscode.Selection(selection.active, newPosition);
    } else if (vimState.mode === Mode.Visual) {
      const vimSelection = vscodeToVimVisualSelection(document, selection);
      const motionPosition = motion({
        document: document,
        position: vimSelection.active,
        selectionIndex: i,
        vimState: vimState,
      });

      return vimToVscodeVisualSelection(document, new vscode.Selection(vimSelection.anchor, motionPosition));
    } else if (vimState.mode === Mode.VisualLine) {
      const vimSelection = vscodeToVimVisualLineSelection(document, selection);
      const motionPosition = motion({
        document: document,
        position: vimSelection.active,
        selectionIndex: i,
        vimState: vimState,
      });

      return vimToVscodeVisualLineSelection(document, new vscode.Selection(vimSelection.anchor, motionPosition));
    } else {
      return selection;
    }
  });

  editor.selections = newSelections;

  editor.revealRange(
    new vscode.Range(newSelections[0].active, newSelections[0].active),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

function findForward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = position.with({ character: position.character + 1 });
    const result = searchForward(document, match[1], fromPosition);

    if (result) {
      return result.with({ character: result.character + 1 });
    } else {
      return position;
    }
  });
}

function findBackward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = positionLeftWrap(document, position);
    const result = searchBackward(document, match[1], fromPosition);

    if (result) {
      return result;
    } else {
      return position;
    }
  });
}

function tillForward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = position.with({ character: position.character + 1 });
    const result = searchForward(document, match[1], fromPosition);

    if (result) {
      return result.with({ character: result.character });
    } else {
      return position;
    }
  });
}

function tillBackward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = positionLeftWrap(document, position);
    const result = searchBackward(document, match[1], fromPosition);

    if (result) {
      return result;
    } else {
      return position;
    }
  });
}

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
    execMotion(vimState, editor, ({ document, position }) => {
      let character = position.character;
      // Try the current line and if we're at the end go to the next line
      // This way we're only keeping one line of text in memory at a time
      // i is representing the relative line number we're on from where we started
      for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(position.line + i).text;
        const ranges = wordRangesFunction(lineText);

        const result = ranges.find((x) => x.start > character);

        if (result) {
          return position.with({ character: result.start, line: position.line + i });
        }
        // If we don't find anything on this line, search the next and reset the character to 0
        character = 0;
      }

      // We may be at the end of the document or nothing else matches
      return position;
    });
  };
}

export function createWordBackwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
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
    });
  };
}

export function createWordEndHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      const lineText = document.lineAt(position.line).text;
      const ranges = wordRangesFunction(lineText);

      const result = ranges.find((x) => x.end > position.character);

      if (result) {
        return position.with({ character: result.end });
      } else {
        return position;
      }
    });
  };
}
