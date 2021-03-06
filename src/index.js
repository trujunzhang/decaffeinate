import { tokens } from 'decaffeinate-coffeescript';
import AddVariableDeclarationsStage from './stages/add-variable-declarations/index.js';
import SemicolonsStage from './stages/semicolons/index.js';
import EsnextStage from './stages/esnext/index.js';
import MainStage from './stages/main/index.js';
import NormalizeStage from './stages/normalize/index.js';
import convertNewlines from './utils/convertNewlines.js';
import detectNewlineStr from './utils/detectNewlineStr.js';
import formatCoffeeLexAst from './utils/formatCoffeeLexTokens.js';
import formatCoffeeScriptAst from './utils/formatCoffeeScriptAst.js';
import formatCoffeeScriptLexerTokens from './utils/formatCoffeeScriptLexerTokens.js';
import formatDecaffeinateParserAst from './utils/formatDecaffeinateParserAst.js';
import parse from './utils/parse.js';
import PatchError from './utils/PatchError.js';
import resolveToPatchError from './utils/resolveToPatchError.js';

export { default as run } from './cli';
export { PatchError };

type Options = {
  filename: ?string,
  runToStage: ?string,
};

type ConversionResult = {
  code: string,
  maps: Array<Object>
};

type Stage = {
  name: string;
  run: (content: string, filename: string) => { code: string, map: Object }
};

/**
 * Convert CoffeeScript source code into modern JavaScript preserving comments
 * and formatting.
 */
export function convert(source: string, options: ?Options={}): ConversionResult {
  let originalNewlineStr = detectNewlineStr(source);
  source = convertNewlines(source, '\n');
  let stages = [
    NormalizeStage,
    MainStage,
    AddVariableDeclarationsStage,
    SemicolonsStage,
    EsnextStage
  ];
  let runToStage = options.runToStage;
  if (runToStage !== null && runToStage !== undefined) {
    let stageIndex = stages.findIndex(stage => stage.name === runToStage);
    if (stageIndex !== -1) {
      stages = stages.slice(0, stageIndex + 1);
    } else {
      return convertCustomStage(source, runToStage);
    }
  }
  let result = runStages(source, options.filename || 'input.coffee', stages);
  result.code = convertNewlines(result.code, originalNewlineStr);
  return result;
}

function runStages(initialContent: string, initialFilename: string, stages: Array<Stage>): ConversionResult {
  let maps = [];
  let content = initialContent;
  let filename = initialFilename;
  stages.forEach(stage => {
    let { code, map } = runStage(stage, content, filename);
    if (code !== content) {
      maps.push(map);
      content = code;
      filename = map.file;
    }
  });
  return { code: content, maps };
}

function runStage(stage: Stage, content: string, filename: string): { code: string, map: Object } {
  try {
    return stage.run(content, filename);
  } catch (err) {
    let patchError = resolveToPatchError(err, content, stage.name);
    if (patchError !== null) {
      throw patchError;
    }
    throw err;
  }
}

function convertCustomStage(source: string, stageName: string): ConversionResult {
  let ast = parse(source);
  if (stageName === 'coffeescript-lexer') {
    return {
      code: formatCoffeeScriptLexerTokens(tokens(source), ast.context),
      maps: [],
    };
  } else if (stageName === 'coffeescript-parser') {
    return {
      code: formatCoffeeScriptAst(ast.context),
      maps: [],
    };
  } else if (stageName === 'coffee-lex') {
    return {
      code: formatCoffeeLexAst(ast.context),
      maps: [],
    };
  } else if (stageName === 'decaffeinate-parser') {
    return {
      code: formatDecaffeinateParserAst(ast),
      maps: [],
    };
  } else {
    throw new Error(`Unrecognized stage name: ${stageName}`);
  }
}
