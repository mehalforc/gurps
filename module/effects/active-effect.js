'use strict'

import { i18n, i18n_f } from '../../lib/utilities.js'

export default class GurpsActiveEffect extends ActiveEffect {
  static init() {
    CONFIG.ActiveEffect.documentClass = GurpsActiveEffect

    Hooks.on('preCreateActiveEffect', GurpsActiveEffect._preCreate)
    Hooks.on('createActiveEffect', GurpsActiveEffect._create)
    Hooks.on('applyActiveEffect', GurpsActiveEffect._apply)
    Hooks.on('updateActiveEffect', GurpsActiveEffect._update)
    Hooks.on('deleteActiveEffect', GurpsActiveEffect._delete)
    Hooks.on('updateCombat', GurpsActiveEffect._updateCombat)

    Hooks.once('ready', function () {
      const oldDuration = Object.getOwnPropertyDescriptor(ActiveEffect.prototype, 'duration')

      Object.defineProperty(ActiveEffect.prototype, 'duration', {
        get: function () {
          let results = oldDuration?.get?.call(this)

          if (results.type === 'none') {
            // check if there is a termination condition
            const d = this.data.duration
            if (!!d?.termination) {
              // TODO add core statusId flag and fix up results to show there is a duration of sorts
              results = {
                type: 'condition',
                duration: null,
                remaining: null,
                termination: d.termination,
                label: d.termination,
              }
            }
          }
          return results
        },
      })
    })
  }

  /**
   * Before adding the ActiveEffect to the Actor/Item -- might be used to augment the data used to create, for example.
   * @param {ActiveEffect} _effect
   * @param {ActiveEffectData} data
   * @param {*} _options
   * @param {*} _userId
   */
  static _preCreate(_effect, data, _options, _userId) {
    if (data.duration && !data.duration.combat && game.combat) data.duration.combat = game.combats?.active?.id
  }

  /**
   * After creation of the ActiveEffect.
   * @param {ActiveEffect} effect
   * @param {ActiveEffectData} _data
   * @param {*} _userId
   */
  static async _create(effect, _data, _userId) {
    if (effect.getFlag('gurps', 'requiresConfig') === true) {
      let dialog = new ActiveEffectConfig(effect)
      await dialog.render(true)
    }
  }

  /**
   * On Actor.applyEffect: Applies only to changes that have mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM.
   * @param {Actor|Item} actor
   * @param {ChangeData} change - the change to apply
   * @param {*} _options
   * @param {*} _user
   */
  static async _apply(actor, change, _options, _user) {
    if (change.key === 'data.conditions.maneuver') actor.replaceManeuver(change.value)
    else if (change.key === 'data.conditions.posture') actor.replacePosture(change)
    // else if (change.key === 'chat') change.effect.chat(actor, JSON.parse(change.value))
    else console.log(change)
  }

  /**
   * When updating an ActiveEffect.
   * @param {ActiveEffect} _effect
   * @param {ActiveEffectData} _data to use to update the effect.
   * @param {*} _options
   * @param {*} _userId
   */
  static _update(_effect, _data, _options, _userId) {
    console.log('update ' + _effect)
  }

  /**
   * When deleting an ActiveEffect.
   * @param {ActiveEffect} _effect
   * @param {ActiveEffectData} _data
   * @param {*} _userId
   */
  static _delete(_effect, _data, _userId) {
    console.log('delete ' + _effect)
  }

  /**
   * Called whenever updating a Combat.
   * @param {Combat} combat
   * @param {CombatData} _data
   * @param {*} _options
   * @param {*} _userId
   */
  static async _updateCombat(combat, _data, _options, _userId) {
    // get previous combatant { round: 6, turn: 0, combatantId: 'id', tokenId: 'id' }
    let previous = combat.previous
    if (previous.tokenId) {
      let token = canvas.tokens?.get(previous.tokenId)

      // go through all effects, removing those that have expired
      if (token && token.actor) {
        for (const effect of token.actor.effects) {
          if (await effect.isExpired())
            ui.notifications.info(
              `${i18n('GURPS.effectExpired', 'Effect has expired: ')} '[${i18n(effect.data.label)}]'`
            )
        }
      }
    }
  }

  /**
   * @param {ActiveEffectData} data
   * @param {any} context
   */
  constructor(data, context) {
    super(data, context)

    this.context = context
    this.chatmessages = []
  }

  get endCondition() {
    return this.getFlag('gurps', 'endCondition')
  }

  set endCondition(otf) {
    this.setFlag('gurps', 'endCondition', otf)
    if (!!otf) {
      this.setFlag('core', 'statusId', `${this.name}-endCondition`)
    }
  }

  get terminateActions() {
    let data = this.getFlag('gurps', 'terminateActions')
    return data ?? []
  }

  /**
   * @param {ActiveEffect} effect
   */
  static getName(effect) {
    return /** @type {string} */ (effect.getFlag('gurps', 'name'))
  }

  static async clearEffectsOnSelectedToken() {
    const effect = _token.actor.effects.contents
    for (let i = 0; i < effect.length; i++) {
      let condition = effect[i].data.label
      let status = effect[i].data.disabled
      let effect_id = effect[i].data._id
      console.log(`Clear Effect: condition: [${condition}] status: [${status}] effect_id: [${effect_id}]`)
      if (status === false) {
        await _token.actor.deleteEmbeddedDocuments('ActiveEffect', [effect_id])
      }
    }
  }

  chat(actor, value) {
    if (!!value?.frequency && value.frequency === 'once') {
      if (this.chatmessages.includes(value.msg)) {
        console.log(`Message [${value.msg}] already displayed, do nothing`)
        return
      }
    }

    for (const key in value.args) {
      let val = value.args[key]
      if (foundry.utils.getType(val) === 'string' && val.startsWith('@')) {
        value.args[key] = actor[val.slice(1)]
      } else if (foundry.utils.getType(val) === 'string' && val.startsWith('!')) {
        value.args[key] = i18n(val.slice(1))
      }
      if (key === 'pdfref') value.args.pdfref = i18n(val)
    }

    let msg = !!value.args ? i18n_f(value.msg, value.args) : i18n(value.msg)

    let self = this
    renderTemplate('systems/gurps/templates/chat-processing.html', { lines: [msg] }).then(content => {
      let users = actor.getOwners()
      let ids = /** @type {string[] | undefined} */ (users?.map(it => it.id))

      let messageData = {
        content: content,
        whisper: ids || null,
        type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
      }
      ChatMessage.create(messageData)
      ui.combat?.render()
      self.chatmessages.push(value.msg)
    })
  }

  // TODO Any ActiveEffect with a status.core.statusId is by default a temporary effect and will be added as an icon to the token.

  async isExpired() {
    if (this.duration && !!this.duration.duration) {
      if (this.duration.remaining <= 1) {
        return true
      }
    }

    // if (!!this.endCondition) {
    //   let action = parselink(this.endCondition)

    //   if (!!action.action) {
    //     if (action.action.type === 'modifier') {
    //       ui.notifications.warn(
    //         `${i18n(
    //           'GURPS.effectBadEndCondition',
    //           'End Condition is not a skill or attribute test: '
    //         )} '[${endCondition}]'`
    //       )
    //       return false
    //     }

    //     return await GURPS.performAction(action.action, this.parent, {
    //       shiftKey: false,
    //       ctrlKey: false,
    //       data: {},
    //     })
    //   } // Looks like a /roll OtF, but didn't parse as one
    //   else
    //     ui.notifications.warn(
    //       `${i18n(
    //         'GURPS.effectBadEndCondition',
    //         'End Condition is not a skill or attribute test: '
    //       )} '[${endCondition}]'`
    //     )
    // }

    return false
  }
}

/*
  {
    key: fields.BLANK_STRING,
    value: fields.BLANK_STRING,
    mode: {
      type: Number,
      required: true,
      default: CONST.ACTIVE_EFFECT_MODES.ADD,
      validate: m => Object.values(CONST.ACTIVE_EFFECT_MODES).includes(m),
      validationError: "Invalid mode specified for change in ActiveEffectData"
      },
      priority: fields.NUMERIC_FIELD
    }
*/
