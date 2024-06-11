import * as vscode from 'vscode';

import { HelixState } from './helix_state_types';
import { ParseKeysStatus } from './parse_keys_types';
import { Mode } from './modes_types';

export type Action = (vimState: HelixState, keys: string[], editor: vscode.TextEditor) => ParseKeysStatus;
export type Action2 = (vimState: HelixState, editor: vscode.TextEditor) => void


export type BindingActionList = [Mode, string[]]

export type BindingLayer = {
	[key: string]: Action2[] | BindingLayer
}
export type BindingStructure = {
	[key in Mode]: BindingLayer
}