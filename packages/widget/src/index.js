import { DigitalHumanWidget } from './widget.js'

function mount(options) {
  return new DigitalHumanWidget(options)
}

if (typeof window !== 'undefined') {
  window.DigitalHumanWidget = { mount }
}

export { DigitalHumanWidget, mount }
