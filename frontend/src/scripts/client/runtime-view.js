import EventHandler from './event-handler'
import ControlSurface from './control-surface'
import NotificationView from './notification-view'
import { htmlBuilder, sanitize } from './util'

class RuntimeView extends EventHandler {
  constructor (wrapperElem) {
    // Call EventHandler initialization code
    super()

    // Attach events to the RuntimeView's control surface
    this.cs = new ControlSurface(wrapperElem.find('.control-surface'))
    this.cs.disableCommands(['step-backward', 'step-forward'])

    // Listen for clicks to the step-backward button on the control surface to
    // move the trace's execution point backward by 1. If the user is already at
    // the start of the trace, the point stays the same
    this.cs.on('step-backward', () => {
      if (this.rendered === true && this.index - 1 >= 0) {
        this.setVisiblePoint(this.index - 1)
      }
    })

    // Listen for clicks to the step-forward button on the control surface to
    // move the trace's execution point forward by 1. If the user is already at
    // the end of the trace, the point stays the same
    this.cs.on('step-forward', () => {
      if (this.rendered === true && this.index + 1 < this.trace.length) {
        this.setVisiblePoint(this.index + 1)
      }
    })

    // Set "wrapperElem" property & significant children elements
    this.wrapperElem = wrapperElem
    this.visualizationElem = wrapperElem.find('.trace-visualization')
    this.variablesElem = wrapperElem.find('.variables-wrapper')

    if (this.visualizationElem.length < 1) {
      throw new Error('missing .trace-visualization element')
    }

    if (this.variablesElem.length < 1) {
      throw new Error('missing .variables-wrapper element')
    }

    // Define events that can be emitted by RuntimeView objects. set-trace-point
    // events are emitted whenever the user changes the currently viewed
    // execution point. get-advice events are emitted whenever the user has
    // specified a variable's target value and indicates that they want the app
    // to suggest some changes
    super.declareEvent('set-trace-point')
    super.declareEvent('get-advice')

    // A boolean flag indicating whether this view is populated with program
    // trace data. If it isn't populated, the step-forward and step-backward
    // buttons won't trigger any actions
    this.rendered = false

    // A cached copy of the current trace & scope data
    this.trace = []
    this.scope = {}

    // Current trace point being displayed
    this.index = 0

    // Display "pending" messages in the visualization and variable views
    this.showPendingMessage()
  }

  render (trace) {
    if (Array.isArray(trace) === false) {
      throw new Error(`trace must be an array, received ${typeof trace}`)
    }

    // The visualization of the execution trace is built last-to-first
    // so that function return values can be collected before their
    // signature, argument, and return values have to be added to the
    // visualization. A stack of return values is kept as the trace is
    // traversed so whenever a "call" event is encountered, the topmost
    // return value is popped and used as the return value
    let returnValueStack = []

    let html = ''

    html += htmlBuilder([
      '<div class="scope top-level">',
      '<ol class="execution">'
    ])

    html += trace.reduceRight((html, point, index) => {
      let lineNum = sanitize(point['line'])
      let pointHtml = ''

      switch (point['event']) {
        case 'instruction_limit_reached':
          NotificationView.send('fatal', 'VM reached instruction limit', {
            large: true,
            code: point['exception_msg']
          }).open()

          return html

        case 'call':
          // Collect a list of the function call's argument values
          let args = {}

          try {
            args = point['stack_to_render'][0]['encoded_locals']
          } catch (err) {
            throw new Error(`cannot get local variables of point ${index}`)
          }

          let argsHtml = Object.keys(args).reduce((html, argName) => {
            // Ignore any argument names that are part of prototype objects
            if (args.hasOwnProperty(argName) === false) {
              return html
            }

            return html.concat(htmlBuilder([
              htmlBuilder.span('sig-name', argName),
              htmlBuilder.span('sig-syntax', ':'),
              htmlBuilder.span('sig-value', `${args[argName]}`)
            ]))
          }, []).join(htmlBuilder.span('sig-syntax', ','))

          let funcName = sanitize(point['func_name'])
          let returnValue = sanitize(returnValueStack.pop())

          if (typeof returnValue !== 'string') {
            throw new Error('call with no return value')
          }

          pointHtml = htmlBuilder([
            // Render only the open tag since the closing tag was rendered
            // when the corresponding "return" trace point was rendered
            '<li class="point call expanded">',

            // Hidden radio button used to ensure that there can't be more
            // than 1 trace point selected at a time
            htmlBuilder.input({
              type: 'radio',
              id: `point-${index}`,
              classes: ['point-radio-button'],
              name: 'point',
              value: index,
              'data-line': lineNum
            }),

            // Label element is the visual representation of the trace point
            // on screen including the function signature and the line-dot icon
            htmlBuilder.label({
              classes: ['func-sig'],
              for: `point-${index}`,
              children: [
                htmlBuilder.span('sig-method', `${funcName}`),
                htmlBuilder.span('sig-syntax', '('),
                argsHtml,
                htmlBuilder.span('sig-syntax', ')'),
                htmlBuilder.span('sig-syntax', '&xrArr;'),
                htmlBuilder.span('sig-value field', returnValue)
              ]
            }),

            // Render only the open tags since the closing tags were rendered
            // when the corresponding "return" trace point was rendered
            '<div class="scope">',
            '<ol class="execution">'
          ])

          return pointHtml + html

        case 'return':
        case 'step_line':
          let isReturn = (point['event'] === 'return')

          // If this point is a return point, append the return value
          // to the stack of return values so the corresponding "call" trace
          // point can use that value in its function signature
          if (isReturn) {
            let returnValue = 'void'

            try {
              returnValue = point['stack_to_render'][0]['encoded_locals']['__return__'].toString()
            } catch (err) {
              throw new Error(`cannot get "__return__" field of point ${index}`)
            }

            returnValueStack.push(sanitize(returnValue))
          }

          pointHtml = htmlBuilder([
            htmlBuilder.li('point', [
              htmlBuilder.input({
                type: 'radio',
                id: `point-${index}`,
                classes: ['point-radio-button'],
                name: 'point',
                value: index,
                'data-line': lineNum
              }),
              htmlBuilder.label({
                for: `point-${index}`
              })
            ]),

            // Closing tags that correspond to open tags rendered for the
            // corresponding "call" trace point
            isReturn ? '</ol>' : '',
            isReturn ? '</div>' : '',
            isReturn ? '</li>' : ''
          ])

          return pointHtml + html

        default:
          console.error(point)
          throw new Error(`cannot handle point at index ${index}`)
      }
    }, '')

    html += htmlBuilder([
      '</div>',
      '</ol>'
    ])

    // Insert the HTML into the DOM
    this.visualizationElem.html(html)

    // Attach event listeners to the newly created visualization HTML
    this.visualizationElem.find('.scope input[type="radio"]').on('click', (event) => {
      let id = jQuery(event.currentTarget).attr('id')
      let index = parseInt(id.replace('point-', ''), 10)

      // Ensure that no corrosive values like NaN escape into the rest of the logic
      if (isNaN(index)) {
        index = 0
      }

      this.setVisiblePoint(index)
    })

    // Cache the trace data
    this.trace = trace

    // Set the "rendered" flag to true
    this.rendered = true

    this.initializeVariableView()

    // View the first execution point
    this.setVisiblePoint(0)

    // Enable forward, backward navigation buttons
    this.cs.enableCommands(['step-backward', 'step-forward'])
  }

  showPendingMessage () {
    const html = '<p class="pending">waiting for execution trace&hellip;</p>'
    this.rendered = false

    this.visualizationElem.html(html)
    this.variablesElem.html(html)
  }

  clear () {
    // Reset stateful properties of the view
    this.rendered = false
    this.trace = []
    this.scope = {}
    this.index = 0

    // Disable commands since there's not data to manipulate
    this.cs.disableCommands(['step-backward', 'step-forward'])

    // Replace any HTML embedded in the trace or variable views with
    // a basic "pending" message
    this.showPendingMessage()
  }

  setVisiblePoint (index) {
    if (this.rendered === true) {
      if (index >= this.trace.length || index < 0) {
        throw new Error(`index ${index} is out of range`)
      }

      let radioButton = this.wrapperElem.find(`.point-radio-button:eq(${index})`)
      let line = parseInt(radioButton.attr('data-line'))

      if (isNaN(line)) {
        throw new Error(`button at index ${index} has corrupted "data-line" property`)
      }

      // If everything checks out, commit to the change
      this.index = index
      radioButton.prop('checked', true)
      this.setVisibleScope(index)
      super.trigger('set-trace-point', [line])
    }
  }

  initializeVariableView () {
    if (this.rendered === true) {
      let variableListHtml = '<ol></ol>'
      let suggestBtnHtml = '<button class="action-button success">Get suggestions</button>'
      // let cancelBtnHtml = '<button class="action-button">Cancel</button>'
      this.variablesElem.html(variableListHtml + suggestBtnHtml)

      this.variablesElem.find('.action-button.success').on('click', (event) => {
        let list = this.variablesElem.find('ol li')
        let varnames = []

        if (list.length > 0) {
          let goals = list.toArray().filter((li) => {
            return jQuery(li).find('.edit').val() !== ''
          }).map((li) => {
            let name = jQuery(li).find('.name').text()
            varnames.push(name)
            return {
              name: name,
              oldValue: parseInt(jQuery(li).find('.value').text()),
              newValue: parseInt(jQuery(li).find('.edit').val())
            }
          })

          let pointClone = JSON.parse(JSON.stringify(this.trace[this.index]))

          pointClone['stack_to_render'][0]['ordered_varnames'] = varnames
          pointClone['stack_to_render'][0]['encoded_locals'] = goals.reduce((map, goal) => {
            map[goal.name] = goal.newValue
            return map
          }, {})

          window.moddedPoint = pointClone
        }
      })
    }
  }

  setVisibleScope (index) {
    if (this.rendered === true) {
      if (index >= this.trace.length || index < 0) {
        throw new Error(`index ${index} is out of range`)
      }

      let point = this.trace[index]
      let callstack = point['stack_to_render']

      if (Array.isArray(callstack) === false) {
        throw new Error(`malformed scope at index ${index}`)
      }

      if (callstack.length > 0) {
        let topCallstack = callstack[0]
        let locals = topCallstack['encoded_locals'] || {}
        let variablesHtml = Object.keys(locals).reduce((html, localName) => {
          if (locals.hasOwnProperty(localName) === false) {
            return html
          }

          return html + htmlBuilder.li([
            htmlBuilder.span('current', [
              htmlBuilder.span('name', sanitize(localName)),
              htmlBuilder.span('value field', sanitize(locals[localName]))
            ]),
            ' &xrarr; ',
            htmlBuilder.input({
              type: 'textbox',
              classes: ['edit'],
              placeholder: '?'
            })
          ])
        }, '')

        this.variablesElem.find('ol').html(variablesHtml)
      }
    }
  }
}

export default RuntimeView