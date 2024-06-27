import * as vscode from 'vscode';

import * as positionUtils from '../position_utils';
import { HelixState } from '../helix_state_types';
import { vscodeToVimVisualSelection } from '../selection_utils';
import { Direction } from '../actions/actions';
import { Mode, ModeEnterFuncs } from '../modes';
import {
  getRegisterContentsList,
  adjustInsertPositions,
  getInsertRangesFromBeginning,
  getInsertRangesFromEnd,
} from './common';

function putText(vimState: HelixState, editor: vscode.TextEditor, registerContentsList: (string | undefined)[]) {
  if (vimState.registers.linewise) {
    normalModeLinewise(vimState, editor, registerContentsList);
  } else {
    normalModeCharacterwise(vimState, editor, registerContentsList);
  }

  // Helix does this
  ModeEnterFuncs[Mode.Normal](vimState);
}

export function putAfter(vimState: HelixState, editor: vscode.TextEditor, clipboard: boolean = false) {
  if (clipboard) {
    vscode.env.clipboard.readText;
    vscode.env.clipboard.readText().then((contents) => {
      putText(vimState, editor, [contents]);
    });
  } else {
    const registerContentsList = getRegisterContentsList(vimState, editor);
    if (registerContentsList === undefined) return;

    putText(vimState, editor, registerContentsList);
  }
}

function normalModeCharacterwise(
  vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[],
) {
  const insertPositions: vscode.Position[] = editor.selections.map((selection) => {
    return vscodeToVimVisualSelection(editor.document, selection, Direction.Auto).end;
  });
  const adjustedInsertPositions = adjustInsertPositions(insertPositions, registerContentsList);
  const insertRanges = getInsertRangesFromBeginning(adjustedInsertPositions, registerContentsList);

  editor
    .edit((editBuilder) => {
      insertPositions.forEach((insertPosition, i) => {
        const registerContents = registerContentsList[i];
        if (registerContents === undefined) return;

        editBuilder.insert(insertPosition, registerContents);
      });
    })
    .then(() => {
      editor.selections = editor.selections.map((selection, i) => {
        const range = insertRanges[i];
        if (range === undefined) return selection;

        return new vscode.Selection(range.start, positionUtils.leftWrap(editor.document, range.end));
      });
    });

  vimState.lastPutRanges = {
    ranges: insertRanges,
    linewise: false,
  };
}

function normalModeLinewise(
  vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[],
) {
  const insertContentsList = registerContentsList.map((contents) => {
    if (contents === undefined) return undefined;
    else return `\n${contents}`;
  });

  const insertPositions = editor.selections.map((selection) => {
    const lineLength = editor.document.lineAt(selection.active.line).text.length;
    return new vscode.Position(selection.active.line, lineLength);
  });

  const adjustedInsertPositions = adjustInsertPositions(insertPositions, insertContentsList);
  const rangeBeginnings = adjustedInsertPositions.map((position) => new vscode.Position(position.line + 1, 0));

  editor
    .edit((editBuilder) => {
      insertPositions.forEach((position, i) => {
        const contents = insertContentsList[i];
        if (contents === undefined) return;

        editBuilder.insert(position, contents);
      });
    })
    .then(() => {
      editor.selections = rangeBeginnings.map((position) => new vscode.Selection(position, position));
    });

  vimState.lastPutRanges = {
    ranges: getInsertRangesFromBeginning(rangeBeginnings, registerContentsList),
    linewise: true,
  };
}
