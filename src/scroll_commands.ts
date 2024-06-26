import * as vscode from 'vscode';

function editorScroll(to: string, by: string) {
  return vscode.commands.executeCommand('editorScroll', {
    to: to,
    by: by,
    revealCursor: true,
    value: 1,
  });
}

export function scrollDownHalfPage(): Thenable<unknown> {
  return editorScroll('down', 'halfPage');
}

export function scrollUpHalfPage(): Thenable<unknown> {
  return editorScroll('up', 'halfPage');
}

export function scrollDownPage(): Thenable<unknown> {
  return editorScroll('down', 'page');
}

export function scrollUpPage(): Thenable<unknown> {
  return editorScroll('up', 'page');
}
