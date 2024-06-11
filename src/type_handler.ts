import * as vscode from 'vscode';

import { tryConsumeChord } from './actions/actions';
import { HelixState } from './helix_state_types';
import { Mode } from './modes_types';

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
export function matchTypeHandler(helixState: HelixState, char: string): void {
  console.log("match " + char)
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  helixState.keysPressed.push(char);

  try {
    handleMatchInput(helixState)
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

  if (helixState.mode === Mode.SearchInProgress || helixState.mode === Mode.Select) {
    if (tryConsumeChord(helixState)) {
      return
    } else {
      helixState.searchState.addChar(helixState, char);
    }
  }
}
