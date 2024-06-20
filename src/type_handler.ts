import * as vscode from 'vscode';

import { ChordConsumeResult, tryConsumeChord } from './helix_config';
import { HelixState } from './helix_state_types';
import { enterPreviousMode, Mode, ModeEnterFuncs } from './modes';
import * as search from './search_utils';
import * as inputTools from './input_utils';

export function typeHandler(helixState: HelixState, char: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Handle number prefixes
  if (/[0-9]/.test(char) && helixState.keysPressed.length === 0) {
    helixState.numbersPressed.push(char);
    return;
  }

  // detect if this has a shift key attached, the only modifier key which triggers this function
  // shift for symbol keys are handled through keybindings setup in package.json:
  // E.G. shift+; pushes "shift" to helixState.keysPressed and then passes ":" here rather than ";"
  if (char.length == 1 && (char.toLowerCase() != char)) {
    return;
  }

  console.log(char)

  helixState.keysPressed.push(char);

  try {
    tryConsumeChord(helixState)
  } catch (error) {
    console.error(error);
  }
}
export function insertTypeHandler(helixState: HelixState, char: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  if (char.length == 1 && (char.toLowerCase() != char)) {
    return;
  }

  console.log(char)

  helixState.keysPressed.push(char);

  const strs = inputTools.literalizeChord(helixState.keysPressed);
  if (strs.length > 0) {
    helixState.keysPressed = [];

    editor.edit((builder) => {
      editor.selections.forEach((sel) => {
        if (sel.active.compareTo(sel.anchor) > 0) {
          builder.insert(sel.anchor, strs.join(''))
        } else {
          builder.insert(sel.active, strs.join(''))
        }
      })
    })

    return;
  }

  try {
    tryConsumeChord(helixState)
  } catch (error) {
    console.error(error);
  }
}
export function rawTypeHandler(helixState: HelixState, char: string): void {
  console.log("raw " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  helixState.keysPressed.push(char);

  try {
    handleInput(helixState)
  } catch (error) {
    console.error(error);
  }
}
export function searchTypeHandler(helixState: HelixState, char: string): void {
  console.log("search " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);

  if (tryConsumeChord(helixState) === ChordConsumeResult.MATCH) {
    return
  } else {
    helixState.searchState.addChar(helixState, char);
  }
}
export function tillCharTypeHandler(helixState: HelixState, char: string): void {
  console.log("till " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);
  const search_str = inputTools.literalizeChord(helixState.keysPressed)

  if (tryConsumeChord(helixState) === ChordConsumeResult.MATCH) {
    return
  } else if (search_str.length > 0) {
    const motionWrapper = helixState.motionForMode;
    if (motionWrapper) {
      motionWrapper(helixState, editor, search_str[0]);
      helixState.repeatLastMotion = (innerHelixState, innerEditor) => {
        motionWrapper(innerHelixState, innerEditor, search_str[0]);
      };
    }

    ModeEnterFuncs[Mode.Normal](helixState);
  }
}
// Will revert to normal mode if, and only if, an *invalid* chord is entered
// Valid chords will reset modes on their own since they may target modes other than normal
// TODO: Undecided: maybe give this function some sort of state which determines which mode to re-enter?
export function execOrAbortTypeHandler(helixState: HelixState, char: string): void {
  console.log("abortable " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);

  let r = tryConsumeChord(helixState);
  if (r !== ChordConsumeResult.INVALID) {
    return
  } else {
    ModeEnterFuncs[Mode.Normal](helixState);
  }
}

// Assumes the selection is not empty by this point
function replaceSelectionWithRepeatingChar(builder: vscode.TextEditorEdit, sel: vscode.Selection, replace_str: string) {
  if (replace_str.length > 1) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const range = new vscode.Range(sel.anchor, sel.end);
  const text = editor.document.getText(range);
  let final_str = replace_str
  for (let i = 1; i < text.length; i++) {
    final_str += replace_str
  }

  builder.replace(sel, final_str);
}

export function replaceTypeHandler(helixState: HelixState, char: string): void {
  console.log("replace " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);
  const replace_str = inputTools.literalizeChord(helixState.keysPressed)

  if (tryConsumeChord(helixState) !== ChordConsumeResult.INVALID) {
    return
  } else if (replace_str.length > 0) {
    editor.edit((builder) => {
      editor.selections.forEach((sel) => {
        if (sel.isEmpty) {
          const sel_ch = new vscode.Selection(
            sel.active,
            new vscode.Position(sel.active.line, sel.active.character + 1)
          )
          replaceSelectionWithRepeatingChar(builder, sel_ch, replace_str[0])
        } else {
          replaceSelectionWithRepeatingChar(builder, sel, replace_str[0])
        }
      });
    })

    ModeEnterFuncs[Mode.Normal](helixState);
  }
}

export function surroundAddTypeHandler(helixState: HelixState, char: string): void {
  console.log("surround add " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);
  const replace_str = inputTools.literalizeChord(helixState.keysPressed)

  if (tryConsumeChord(helixState) !== ChordConsumeResult.INVALID) {
    return
  } else {
    const [startChar, endChar] = inputTools.getMatchPairs(replace_str[0]);
    // Add char to both ends of each selection
    editor.edit((editBuilder) => {
      // Add char to both ends of each selection
      editor.selections.forEach((selection) => {
        const start = selection.start;
        let end = undefined;
        if (selection.isEmpty) {
          end = new vscode.Position(selection.end.line, selection.end.character + 1);
        } else {
          end = selection.end;
        }

        editBuilder.insert(start, startChar);
        editBuilder.insert(end, endChar);
      });
    });

    enterPreviousMode(helixState);
  }
}
export function surroundReplaceTypeHandler(helixState: HelixState, char: string): void {
  console.log("surround rep " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);
  const literal_input = inputTools.literalizeChord(helixState.keysPressed)

  if (tryConsumeChord(helixState, false) !== ChordConsumeResult.INVALID) {
    return
  } else {
    const original = literal_input[0];
    const replacement = literal_input[1];

    if (original === undefined || replacement === undefined) return;

    // As long as we got 2 inputs, we're going back to normal mode
    enterPreviousMode(helixState);

    const [startCharOrig, endCharOrig] = inputTools.getMatchPairs(original);
    const [startCharNew, endCharNew] = inputTools.getMatchPairs(replacement);
    const num = helixState.resolveCount();

    const forwardPosition = search.searchForwardBracket(
      editor.document,
      startCharOrig,
      endCharOrig,
      editor.selection.active,
      num,
    );
    const backwardPosition = search.searchBackwardBracket(
      editor.document,
      startCharOrig,
      endCharOrig,
      editor.selection.active,
      num,
    );

    if (forwardPosition === undefined || backwardPosition === undefined) return;

    // Add char to both ends of each selection
    editor.edit((editBuilder) => {
      // Add char to both ends of each selection
      editBuilder.replace(
        new vscode.Range(forwardPosition, forwardPosition.with({ character: forwardPosition.character + 1 })),
        endCharNew,
      );
      editBuilder.replace(
        new vscode.Range(backwardPosition, backwardPosition.with({ character: backwardPosition.character + 1 })),
        startCharNew,
      );
    });
  }
}
export function surroundDeleteTypeHandler(helixState: HelixState, char: string): void {
  console.log("surround del " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Bindings in search mode are an odd idea but it is how we avoid hardcoded rules for escape and backspace
  helixState.keysPressed.push(char);
  const literal_input = inputTools.literalizeChord(helixState.keysPressed)

  if (tryConsumeChord(helixState) !== ChordConsumeResult.INVALID) {
    return
  } else {
    enterPreviousMode(helixState);

    const char = literal_input[0];
    const [startChar, endChar] = inputTools.getMatchPairs(char);
    const num = helixState.resolveCount();

    const forwardPosition = search.searchForwardBracket(editor.document, startChar, endChar, editor.selection.active, num);
    const backwardPosition = search.searchBackwardBracket(editor.document, startChar, endChar, editor.selection.active, num);

    if (forwardPosition === undefined || backwardPosition === undefined) return;

    // Add char to both ends of each selection
    editor.edit((editBuilder) => {
      // Add char to both ends of each selection
      editBuilder.delete(
        new vscode.Range(forwardPosition, forwardPosition.with({ character: forwardPosition.character + 1 })),
      );
      editBuilder.delete(
        new vscode.Range(backwardPosition, backwardPosition.with({ character: backwardPosition.character + 1 })),
      );
    });
  }
}
