import * as vscode from 'vscode';

import { HelixState } from './helix_state_types';

export function setTypeSubscription(
  vimState: HelixState,
  typeHandler: (vimState: HelixState, char: string) => void,
): void {
  removeTypeSubscription(vimState);
  vimState.typeSubscriptionDisposable = vscode.commands.registerCommand('type', (e) => {
    typeHandler(vimState, e.text);
  });
  vimState.typeSubscription = typeHandler;
}

export function removeTypeSubscription(vimState: HelixState): void {
  if (vimState.typeSubscriptionDisposable) {
    vimState.typeSubscriptionDisposable.dispose();
  }
}
