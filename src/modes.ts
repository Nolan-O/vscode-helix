import * as vscode from 'vscode';

import { HelixState } from './helix_state_types';
import { bindingContextVars } from './bindings';
import {
  typeHandler,
  execOrAbortTypeHandler,
  searchTypeHandler,
  tillCharTypeHandler,
  replaceTypeHandler,
  insertTypeHandler,
} from './type_handler';
import { setTypeSubscription, removeTypeSubscription } from './type_subscription';
import { MotionWrapper } from './actions/motions';

// We're going to be indexing objects with these so it's safest to make them strings
export enum Mode {
  Insert = '0',
  Normal = '1',
  Visual = '2',
  VisualLine = '3',
  Occurrence = '4',
  Window = '5',
  SearchInProgress = '6',
  Select = '7',
  View = '8',
  Match = '9',

  Find = '10',
  Replace = '11',
  // A special-ish mode for gathering input, see match replace/add for example
  // any mode can set this mode to unbind its sub-bindings without changing a type handler
  InputGathering = '12',

  // Functionally disables helix
  VSCode = '13',
}

function enterInsertMode(helixState: HelixState, before = true): void {
  setTypeSubscription(helixState, insertTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterNormalMode(helixState: HelixState): void {
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterSearchMode(helixState: HelixState): void {
  setTypeSubscription(helixState, searchTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterSelectMode(helixState: HelixState): void {
  setTypeSubscription(helixState, searchTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterWindowMode(helixState: HelixState): void {
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVisualMode(helixState: HelixState): void {
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVisualLineMode(helixState: HelixState): void {
  setTypeSubscription(helixState, typeHandler);
}

function enterViewMode(helixState: HelixState): void {
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterFindMode(helixState: HelixState, motionWrapper: MotionWrapper): void {
  helixState.motionForMode = motionWrapper;
  setTypeSubscription(helixState, tillCharTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterReplaceMode(helixState: HelixState): void {
  setTypeSubscription(helixState, replaceTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterMatchMode(helixState: HelixState): void {
  setTypeSubscription(helixState, execOrAbortTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVSCodeMode(helixState: HelixState): void {
  removeTypeSubscription(helixState);
  helixState.commandLine.setText('', helixState);
}

function enterInputGatheringMode(
  helixState: HelixState,
  subscription: (helixState: HelixState, char: string) => void,
): void {
  setTypeSubscription(helixState, subscription);
}

type ModeEnterFuncs = {
  [key in Mode]: (helixState: HelixState, ...args: any) => void;
};

function enterModeCommon(
  mode: Mode,
  modeEnterFunc: (helixState: HelixState, ...args: any) => void,
): (helixState: HelixState, ...args: any) => void {
  return (helixState: HelixState, ...args: any) => {
    setPreviousMode(helixState);
    helixState.mode = mode;

    // TODO: the vim extension uses an async wrapper around setContext because of latency, probably a good idea
    for (const key in bindingContextVars[helixState.previousMode]) {
      vscode.commands.executeCommand('setContext', key, false);
    }
    for (const key in bindingContextVars[mode]) {
      vscode.commands.executeCommand('setContext', key, true);
    }

    if (mode == Mode.VSCode) {
      vscode.commands.executeCommand('setContext', 'hxEnabled', false);
    } else {
      vscode.commands.executeCommand('setContext', 'hxEnabled', true);
    }

    modeEnterFunc(helixState, ...args);
  };
}

export const ModeEnterFuncs: ModeEnterFuncs = {
  [Mode.Insert]: enterModeCommon(Mode.Insert, enterInsertMode),
  [Mode.Normal]: enterModeCommon(Mode.Normal, enterNormalMode),
  [Mode.SearchInProgress]: enterModeCommon(Mode.SearchInProgress, enterSearchMode),
  [Mode.Select]: enterModeCommon(Mode.Select, enterSelectMode),
  [Mode.Window]: enterModeCommon(Mode.Window, enterWindowMode),
  [Mode.Visual]: enterModeCommon(Mode.Visual, enterVisualMode),
  [Mode.VisualLine]: enterModeCommon(Mode.VisualLine, enterVisualLineMode),
  [Mode.View]: enterModeCommon(Mode.View, enterViewMode),
  [Mode.Find]: enterModeCommon(Mode.Find, enterFindMode),
  [Mode.Replace]: enterModeCommon(Mode.Replace, enterReplaceMode),
  [Mode.Match]: enterModeCommon(Mode.Match, enterMatchMode),
  [Mode.InputGathering]: enterModeCommon(Mode.InputGathering, enterInputGatheringMode),
  [Mode.VSCode]: enterModeCommon(Mode.VSCode, enterVSCodeMode),
  [Mode.Occurrence]: () => { },
};

export function enterPreviousMode(helixState: HelixState) {
  let previousMode = helixState.previousMode;
  if (previousMode == undefined) {
    // If this actually happens, this function is being misused
    previousMode = Mode.Normal;
  }

  ModeEnterFuncs[previousMode](helixState);
}

export function setPreviousMode(helixState: HelixState) {
  helixState.previousMode = helixState.mode;
}

export function setModeCursorStyle(mode: Mode, editor: vscode.TextEditor): void {
  if (mode === Mode.Insert || mode === Mode.Occurrence || mode == Mode.VSCode) {
    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;
  } else {
    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
  }
}
