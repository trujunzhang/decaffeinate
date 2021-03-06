import DynamicMemberAccessOpPatcher from './DynamicMemberAccessOpPatcher.js';
import findSoakContainer from '../../../utils/findSoakContainer.js';

const GUARD_HELPER =
  `function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}`;

export default class SoakedDynamicMemberAccessOpPatcher extends DynamicMemberAccessOpPatcher {
  _shouldSkipSoakPatch: boolean;

  constructor(node: Node, context: ParseContext, editor: Editor, expression: NodePatcher, indexingExpr: NodePatcher) {
    super(node, context, editor, expression, indexingExpr);
    this._shouldSkipSoakPatch = false;
  }

  patchAsExpression() {
    if (!this._shouldSkipSoakPatch) {
      this.registerHelper('__guard__', GUARD_HELPER);
      let soakContainer = findSoakContainer(this);
      let varName = soakContainer.claimFreeBinding('x');
      this.overwrite(this.expression.outerEnd, this.indexingExpr.outerStart, `, ${varName} => ${varName}[`);
      soakContainer.insert(soakContainer.contentStart, '__guard__(');
      soakContainer.insert(soakContainer.contentEnd, ')');
    }

    this.expression.patch();
    this.indexingExpr.patch();
  }

  setShouldSkipSoakPatch() {
    this._shouldSkipSoakPatch = true;
  }
}
