import * as vscode from 'vscode';
import * as positionUtils from '../position_utils';
import type { HelixState } from '../helix_state_types';
import { vscodeToVimVisualSelection } from '../selection_utils';
import { Direction } from '../actions/actions';
import { adjustInsertPositions, getInsertRangesFromBeginning, getRegisterContentsList } from './common';
import { Mode, ModeEnterFuncs } from '../modes';

function putText(vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[]
) {
  if (vimState.registers.linewise) {
    normalModeLinewise(vimState, editor, registerContentsList);
  } else {
    normalModeCharacterwise(vimState, editor, registerContentsList);
  }

  // Helix does this
  ModeEnterFuncs[Mode.Normal](vimState)
}

export function putBefore(vimState: HelixState, editor: vscode.TextEditor, clipboard: boolean = false) {
  if (clipboard) {
    vscode.env.clipboard.readText
    vscode.env.clipboard.readText().then((contents) => {
      putText(vimState, editor, [contents]);
    })
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
    return vscodeToVimVisualSelection(editor.document, selection, Direction.Auto).start
  })
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
    else return `${contents}\n`;
  });

  const insertPositions = editor.selections.map((selection) => {
    return new vscode.Position(selection.active.line, 0);
  });

  const adjustedInsertPositions = adjustInsertPositions(insertPositions, insertContentsList);

  editor
    .edit((editBuilder) => {
      insertPositions.forEach((position, i) => {
        const contents = insertContentsList[i];
        if (contents === undefined) return;

        editBuilder.insert(position, contents);
      });
    })
    .then(() => {
      editor.selections = editor.selections.map((selection, i) => {
        const position = adjustedInsertPositions[i];
        if (position === undefined) return selection;

        return new vscode.Selection(position, position);
      });
    });

  vimState.lastPutRanges = {
    ranges: getInsertRangesFromBeginning(adjustedInsertPositions, registerContentsList),
    linewise: true,
  };
}