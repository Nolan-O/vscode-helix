import * as vscode from 'vscode';

import { HelixState } from './helix_state_types';
import { Mode } from './modes';

export type Action = (vimState: HelixState, editor: vscode.TextEditor) => void;

export type BindingActionList = [Mode, string[]];
export type BindingLayer = {
  [key: string]: Action[] | BindingLayer;
};
export type BindingStructure = {
  [key in Mode]: BindingLayer;
};

export type ContextList = { [key: string]: true | undefined };
export type ContextStructure = {
  [key in Mode]: ContextList;
};
