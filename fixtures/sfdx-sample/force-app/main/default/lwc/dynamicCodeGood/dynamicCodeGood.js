import { LightningElement, api } from 'lwc';

const OPERATIONS = {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b
};

export default class DynamicCodeGood extends LightningElement {
    @api operation = 'add';
    @api config = '{}';

    get result() {
        // eval(this.formula) was replaced by a lookup table
        const operate = OPERATIONS[this.operation];
        return typeof operate === 'function' ? operate(1, 1) : null;
    }

    get settings() {
        return JSON.parse(this.config);
    }

    evaluate(engine) {
        return engine.eval('noop');
    }
}
