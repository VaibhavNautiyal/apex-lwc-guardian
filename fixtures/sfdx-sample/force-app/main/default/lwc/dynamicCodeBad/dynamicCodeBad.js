import { LightningElement, api } from 'lwc';

export default class DynamicCodeBad extends LightningElement {
    @api formula = '1 + 1';

    get result() {
        return eval(this.formula);
    }

    buildValidator(body) {
        const validate = new Function('value', body);
        return validate;
    }

    runGlobal(expression) {
        return window.eval(expression);
    }
}
