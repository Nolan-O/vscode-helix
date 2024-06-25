import * as vscode from 'vscode';

import { HelixState } from './helix_state_types';
import { bindingContextVars } from './helix_config';
import {
  typeHandler,
  execOrAbortTypeHandler,
  searchTypeHandler,
  tillCharTypeHandler,
  replaceTypeHandler,
  insertTypeHandler
} from './type_handler';
import { setTypeSubscription, removeTypeSubscription } from './type_subscription';
import { MotionWrapper } from './actions/motions';

// We're going to be indexing objects with these so it's safest to make them strings
export enum Mode {
  Disabled = "0",
  Insert = "1",
  Normal = "2",
  Visual = "3",
  VisualLine = "4",
  Occurrence = "5",
  Window = "6",
  SearchInProgress = "7",
  CommandlineInProgress = "8",
  Select = "9",
  View = "10",
  Match = "11",

  Find = "12",
  Replace = "13",
  // A special-ish mode for gathering input, see match replace/add for example
  // any mode can set this mode to unbind its sub-bindings without changing a type handler
  InputGathering = "14",

  // Functionally disables helix
  VSCode = "15",
}

function enterInsertMode(helixState: HelixState, before = true): void {
  helixState.mode = Mode.Insert;
  setTypeSubscription(helixState, insertTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterNormalMode(helixState: HelixState): void {
  helixState.mode = Mode.Normal;
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterSearchMode(helixState: HelixState): void {
  helixState.mode = Mode.SearchInProgress;
  setTypeSubscription(helixState, searchTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterSelectMode(helixState: HelixState): void {
  helixState.mode = Mode.Select;
  setTypeSubscription(helixState, searchTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterWindowMode(helixState: HelixState): void {
  helixState.mode = Mode.Window;
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVisualMode(helixState: HelixState): void {
  helixState.mode = Mode.Visual;
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVisualLineMode(helixState: HelixState): void {
  helixState.mode = Mode.VisualLine;
  setTypeSubscription(helixState, typeHandler);
}

function enterViewMode(helixState: HelixState): void {
  helixState.mode = Mode.View;
  setTypeSubscription(helixState, typeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterDisabledMode(helixState: HelixState): void {
  helixState.mode = Mode.Disabled;
  setModeCursorStyle(helixState.mode, helixState.editorState.activeEditor!);
  removeTypeSubscription(helixState);
  helixState.commandLine.setText('', helixState);
}

function enterFindMode(helixState: HelixState, motionWrapper: MotionWrapper): void {
  helixState.mode = Mode.Find;
  helixState.motionForMode = motionWrapper;
  setTypeSubscription(helixState, tillCharTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterReplaceMode(helixState: HelixState): void {
  helixState.mode = Mode.Replace;
  setTypeSubscription(helixState, replaceTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterMatchMode(helixState: HelixState): void {
  helixState.mode = Mode.Match;
  setTypeSubscription(helixState, execOrAbortTypeHandler);
  helixState.commandLine.setText('', helixState);
}

function enterVSCodeMode(helixState: HelixState): void {
  helixState.mode = Mode.VSCode;
  removeTypeSubscription(helixState);
  helixState.commandLine.setText('', helixState);
}

function enterInputGatheringMode(helixState: HelixState, subscription: (helixState: HelixState, char: string) => void): void {
  helixState.mode = Mode.InputGathering;
  setTypeSubscription(helixState, subscription);
}

type ModeEnterFuncs = {
  [key in Mode]: (helixState: HelixState, ...args: any) => void;
};

function enterModeCommon(mode: Mode, modeEnterFunc: (helixState: HelixState, ...args: any) => void): (helixState: HelixState, ...args: any) => void {
  return (helixState: HelixState, ...args: any) => {
    setPreviousMode(helixState);
    for (const key in bindingContextVars[helixState.previousMode]) {
      vscode.commands.executeCommand('setContext', key, false);
    }
    for (const key in bindingContextVars[mode]) {
      vscode.commands.executeCommand('setContext', key, true);
      console.log(key)
    }

    if (mode == Mode.VSCode) {
      vscode.commands.executeCommand('setContext', 'hxEnabled', false);
    } else {
      vscode.commands.executeCommand('setContext', 'hxEnabled', true);
    }

    modeEnterFunc(helixState, ...args)
  }
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
  [Mode.Disabled]: enterModeCommon(Mode.Disabled, enterDisabledMode),
  [Mode.Find]: enterModeCommon(Mode.Find, enterFindMode),
  [Mode.Replace]: enterModeCommon(Mode.Replace, enterReplaceMode),
  [Mode.Match]: enterModeCommon(Mode.Match, enterMatchMode),
  [Mode.InputGathering]: enterModeCommon(Mode.InputGathering, enterInputGatheringMode),
  [Mode.VSCode]: enterModeCommon(Mode.VSCode, enterVSCodeMode),
  [Mode.Occurrence]: () => { },
  [Mode.CommandlineInProgress]: () => { },
}

// Somewhat misleading name, this only enters the previous mode which was set with setPreviousMode
// Using this properly can only be done by functions which have knowledge of implied usage of setPreviousMode
// E.G. match mode's sub commands/type handlers can use this to revert to the mode that was used prior to match mode
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
  if (mode === Mode.Insert || mode === Mode.Occurrence || mode === Mode.Disabled || mode == Mode.VSCode) {
    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;
  } else {
    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
  }
}
