import * as vscode from 'vscode';
import { Direction } from './actions/actions';
import * as positionUtils from './position_utils';

export function vscodeToVimVisualSelection(
  document: vscode.TextDocument,
  vscodeSelection: vscode.Selection,
  direction: Direction
): vscode.Selection {
  if (direction === Direction.Left || direction === Direction.Up) {
    if (vscodeSelection.active.isBefore(vscodeSelection.anchor)) {
      console.log("Lbef")
      return new vscode.Selection(vscodeSelection.anchor, vscodeSelection.active);
    } else if (vscodeSelection.active.isEqual(vscodeSelection.anchor)) {
      console.log("Leq")
      return new vscode.Selection(positionUtils.rightWrap(document, vscodeSelection.anchor), vscodeSelection.active);
    } else {
      console.log("Laft")
      return new vscode.Selection(vscodeSelection.active, vscodeSelection.anchor);
    }
  } else if (direction === Direction.Right || direction === Direction.Down) {
    if (vscodeSelection.active.isBefore(vscodeSelection.anchor)) {
      console.log("Rbef")
      return new vscode.Selection(vscodeSelection.active, vscodeSelection.anchor);
    } else if (vscodeSelection.active.isEqual(vscodeSelection.anchor)) {
      console.log("Req")
      return new vscode.Selection(vscodeSelection.anchor, positionUtils.rightWrap(document, vscodeSelection.active))
    } else {
      console.log("Raft")
      return new vscode.Selection(vscodeSelection.anchor, positionUtils.rightWrap(document, vscodeSelection.active));
    }
  } else if (direction === Direction.Auto) {
    if (vscodeSelection.active.compareTo(vscodeSelection.anchor) >= 0) {
      console.log("Agt")
      return new vscode.Selection(vscodeSelection.anchor, positionUtils.rightWrap(document, vscodeSelection.active))
    } else {
      console.log("Abef")
      return new vscode.Selection(vscodeSelection.active, vscodeSelection.anchor);
    }
  } else {
    return new vscode.Selection(vscodeSelection.anchor, vscodeSelection.active);
  }
}

export function vimToVscodeVisualSelection(
  document: vscode.TextDocument,
  vimSelection: vscode.Selection,
  direction: Direction
): vscode.Selection {
  if (direction === Direction.Unknown) {
    if (vimSelection.active.isBefore(vimSelection.anchor)) {
      console.log("1bef")
      return new vscode.Selection(vimSelection.anchor, vimSelection.active);
    } else if (vimSelection.active.isEqual(vimSelection.anchor)) {
      console.log("1eq")
      return new vscode.Selection(vimSelection.anchor, vimSelection.active);
    } else {
      console.log("1aft")
      return new vscode.Selection(vimSelection.anchor, vimSelection.active);
    }
  } else {
    if (vimSelection.active.isBefore(vimSelection.anchor)) {
      console.log("1bef")
      return new vscode.Selection(vimSelection.anchor, vimSelection.active);
      //}
    } else if (vimSelection.active.isEqual(vimSelection.anchor)) {
      console.log("1eq")
      return new vscode.Selection(vimSelection.anchor, vimSelection.active);
    } else {
      console.log("1aft")
      return new vscode.Selection(vimSelection.anchor, positionUtils.left(vimSelection.active));
    }
  }
}

export function vscodeToVimVisualLineSelection(
  document: vscode.TextDocument,
  vscodeSelection: vscode.Selection,
): vscode.Selection {
  return new vscode.Selection(
    vscodeSelection.anchor.with({ character: 0 }),
    vscodeSelection.active.with({ character: 0 }),
  );
}

export function vimToVscodeVisualLineSelection(
  document: vscode.TextDocument,
  vimSelection: vscode.Selection,
): vscode.Selection {
  const anchorLineLength = document.lineAt(vimSelection.anchor.line).text.length;
  const activeLineLength = document.lineAt(vimSelection.active.line).text.length;

  if (vimSelection.active.isBefore(vimSelection.anchor)) {
    return new vscode.Selection(
      vimSelection.anchor.with({ character: anchorLineLength }),
      vimSelection.active.with({ character: 0 }),
    );
  } else {
    return new vscode.Selection(
      vimSelection.anchor.with({ character: 0 }),
      vimSelection.active.with({ character: activeLineLength }),
    );
  }
}

export function toOuterLinewiseSelection(document: vscode.TextDocument, selection: vscode.Selection) {
  const anchorLineLength = document.lineAt(selection.anchor.line).text.length;
  const activeLineLength = document.lineAt(selection.active.line).text.length;

  if (selection.active.isBefore(selection.anchor)) {
    return new vscode.Selection(
      selection.anchor.with({ character: anchorLineLength }),
      selection.active.with({ character: 0 }),
    );
  } else {
    return new vscode.Selection(
      selection.anchor.with({ character: 0 }),
      selection.active.with({ character: activeLineLength }),
    );
  }
}

export function toInnerLinewiseSelection(document: vscode.TextDocument, selection: vscode.Selection) {
  const anchorLineLength = document.lineAt(selection.anchor.line).text.length;
  const activeLineLength = document.lineAt(selection.active.line).text.length;
  let anchor = selection.anchor
  let active = selection.active

  if (active.isBefore(anchor)) {
    if (anchor.character !== 0 && anchor.character !== anchorLineLength) {
      const len = document.lineAt(anchor.line - 1).text.length
      anchor = anchor.with({ line: anchor.line - 1, character: len })
    }
    if (active.character !== 0)
      active = active.with({ line: active.line + 1, character: 0 })

    return new vscode.Selection(anchor, active);
  } else {
    if (active.character !== 0 && active.character !== activeLineLength) {
      const len = document.lineAt(active.line - 1).text.length
      active = active.with({ line: active.line - 1, character: len })
    }
    if (anchor.character !== 0)
      anchor = anchor.with({ line: anchor.line + 1, character: 0 })

    return new vscode.Selection(anchor, active);
  }
}

export function flipSelection(editor: vscode.TextEditor | undefined) {
  if (!editor) {
    return;
  }

  editor.selections = editor.selections.map((s) => new vscode.Selection(s.active, s.anchor));
  // When flipping selection the new active position may be off screen, so reveal line to the active location
  vscode.commands.executeCommand('revealLine', {
    lineNumber: editor.selection.active.line,
    at: 'center',
  });
}
