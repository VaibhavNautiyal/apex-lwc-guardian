import { LightningElement, api } from 'lwc';

export default class UnsafeHtmlBad extends LightningElement {
    @api message;

    renderedCallback() {
        const container = this.template.querySelector('.content');
        container.innerHTML = this.message;
        container.insertAdjacentHTML('beforeend', '<hr>');
        this.template.querySelector('.footer').outerHTML = '<p>' + this.message + '</p>';
    }
}
