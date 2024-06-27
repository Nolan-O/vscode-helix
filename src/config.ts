import * as vscode from 'vscode';
import * as toml from 'smol-toml';
import * as json5 from 'json5';
import { addBinding } from './bindings';
import * as inputUtils from './input_utils';
import { actionFuncs } from './actions/actions';
import { Action } from './action_types';
import { Mode } from './modes';

async function open_file(windows_uri: vscode.Uri, other_uri: vscode.Uri): Promise<string> {
  return new Promise((resolve, reject) => {
    vscode.workspace.fs
      .readFile(windows_uri)
      .then((bytes) => {
        resolve(bytes.toString());
      })
      .catch(() => {
        vscode.workspace.fs
          .readFile(other_uri)
          .then((bytes) => {
            resolve(bytes.toString());
          })
          .catch(() => {
            reject();
          });
      });
  });
}

export async function getHelixConfig() {
  // os.homedir() returns "home" for some reason
  // os.userInfo is not available for some reason
  // But it seems process.env['HOMEPATH'] works
  let windows_uri = vscode.Uri.file(process.env['HOMEPATH'] + '\\AppData\\Roaming\\helix\\config.toml');
  // TODO: Test this env var is also set on linux
  let other_uri = vscode.Uri.file(process.env['HOMEPATH'] + '/.config/helix/config.toml');

  let file = null;
  await open_file(windows_uri, other_uri)
    .then((str) => {
      file = str;
    })
    .catch(() => {});

  if (file == null) {
    return;
  }

  return toml.parse(file);
}

export async function getVSConfig() {
  let windows_uri = vscode.Uri.file(process.env['HOMEPATH'] + '\\AppData\\Roaming\\Code\\User\\keybindings.json');
  let other_uri = vscode.Uri.file(process.env['HOMEPATH'] + '/.config/Code/User/keybindings.json');

  let file = null;
  await open_file(windows_uri, other_uri)
    .then((str) => {
      file = str;
    })
    .catch(() => {});

  if (file == null) {
    return;
  }

  return json5.parse(file);
}

type ConvertedBinding = {
  chord: string[];
  commands: Action[];
};
type ConvertedBindings = {
  [key: Mode]: ConvertedBinding[];
};
type HelixBindingLeaf = string | string[];
type HelixBindingNode = { [key: string]: HelixBindingNode } | HelixBindingLeaf;
type HelixBindingRoot = { [key: string]: HelixBindingNode };

const helixKeysToVSCodeKeys: { [key: string]: string | undefined } = {
  ret: 'enter',
  minus: '-',
  del: 'delete',
  esc: 'escape',
  ins: 'insert',
};

// Thankfully minor modes cannot be used as mode keys in helix's config, not even select/command
const helixModesToVSCodeModes: { [key: string]: string | undefined } = {
  normal: 'Normal',
  insert: 'Insert',
  select: 'Select',
};

function helixChordToExtensionChord(chord: readonly string[]) {
  let res: string[] = [];

  function pushHelixKey(key: string) {
    if (key.length === 1) {
      if (key.toLowerCase() !== key) {
        res.push('shift');
        res.push(key.toLowerCase());
      } else if (inputUtils.unshiftedSymbols[key] !== undefined) {
        res.push('shift');
        res.push(inputUtils.unshiftedSymbols[key]);
      } else if (helixKeysToVSCodeKeys[key] !== undefined) {
        res.push('shift');
        res.push(helixKeysToVSCodeKeys[key]);
      } else {
        res.push(key);
      }
    } else {
      res.push(key);
    }
  }

  for (let i = 0; i < chord.length; i++) {
    const str = chord[i];
    if (str.length > 1) {
      const constituents = str.split('-');

      for (let j = 0; j < constituents.length - 1; j++) {
        const mod = inputUtils.reverseModifierCodes[constituents[j]];
        if (mod === undefined) {
          throw 'Helix keymap: Unknown modifier key: ' + constituents[j];
        }

        res.push(mod);
      }

      const key = constituents[constituents.length - 1];
      pushHelixKey(key);
    } else {
      pushHelixKey(str);
    }
  }

  return res;
}

function checkAndConvertBinding(convertedBindings: ConvertedBinding[], chord: string[], commands: string[]) {
  const convertedChord = helixChordToExtensionChord(chord);
  let actions: Action[] = [];

  let valid = true;
  for (let i = 0; i < commands.length; i++) {
    const action = commands[i];
    if (actionFuncs[action] === undefined) {
      valid = false;
      console.warn('Helix keymap: Unrecognized command (may be valid but unimplemented in extension): ' + action);
      break;
    }

    actions.push(actionFuncs[action]);
  }

  if (valid === true) convertedBindings.push({ chord: convertedChord, commands: actions });
}

function extractBindingTree(
  helixBindings: HelixBindingNode,
  chordSoFar: string[],
  convertedBindings: ConvertedBinding[],
) {
  if (Array.isArray(helixBindings)) {
    checkAndConvertBinding(convertedBindings, chordSoFar, helixBindings);
  } else if (typeof helixBindings == 'string') {
    checkAndConvertBinding(convertedBindings, chordSoFar, [helixBindings]);
  } else {
    for (const k in helixBindings) {
      chordSoFar.push(k);
      extractBindingTree(helixBindings[k], chordSoFar, convertedBindings);
      chordSoFar.pop();
    }
  }
}

function extractBindings(config: Record<string, toml.TomlPrimitive>) {
  let convertedBindings: ConvertedBindings = {};
  if (config.keys === undefined) return convertedBindings;

  const helixBindings: HelixBindingRoot = config.keys;

  for (const mode in helixBindings) {
    const convertedMode = helixModesToVSCodeModes[mode];
    if (convertedMode === undefined) {
      throw "Helix keymap: Unknown mode (expected one of 'normal', 'insert', 'select'): " + mode;
    }

    const modeTree = helixBindings[mode];
    let theseBindings: ConvertedBinding[] = [];
    extractBindingTree(modeTree, [], theseBindings);
    convertedBindings[Mode[convertedMode]] = theseBindings;
  }

  return convertedBindings;
}

function processBindings(allBindings: ConvertedBindings) {
  for (const mode in allBindings) {
    const _bindings = allBindings[mode];
    for (let i = 0; i < _bindings.length; i++) {
      const binding = _bindings[i];
      addBinding(binding.commands, [[mode, binding.chord]], false);
    }
  }
}

export async function applyConfig() {
  const helixConfig = await getHelixConfig();
  if (helixConfig === undefined) return;

  let parsed_config = {};
  try {
    let bindings = extractBindings(helixConfig);
    processBindings(bindings);
  } catch (e) {
    console.warn('Helix keymap: Failed to apply config.toml, using defaults: ' + e);
  }
}
