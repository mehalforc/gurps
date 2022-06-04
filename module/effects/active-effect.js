'use strict'

import { SYSTEM_NAME } from '../../lib/miscellaneous-settings.js'
import { parselink } from '../../lib/parselink.js'
import { i18n, i18n_f } from '../../lib/utilities.js'

const ACTIVE_EFFECT_AUTOREMOVE = 'AE-autoremove'

export default class GurpsActiveEffect extends ActiveEffect {
  static init() {
    CONFIG.ActiveEffect.documentClass = GurpsActiveEffect

    // Keep track of the last version number
    game.settings.register(SYSTEM_NAME, ACTIVE_EFFECT_AUTOREMOVE, {
      name: i18n('GURPS.settingEffectAutoremove', 'Active Effects: Auto-remove'),
      hint: i18n(
        'GURPS.settingHintEffectAutoremove',
        'If true, expired Active Effects will automatically be removed from the token.'
      ),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: value => console.log(`Active Effect autoremove : ${value}`),
    })

    Hooks.once('ready', function () {
      Hooks.on('preCreateActiveEffect', GurpsActiveEffect._preCreate)
      Hooks.on('createActiveEffect', GurpsActiveEffect._create)
      Hooks.on('applyActiveEffect', GurpsActiveEffect._apply)
      Hooks.on('updateActiveEffect', GurpsActiveEffect._update)
      Hooks.on('deleteActiveEffect', GurpsActiveEffect._delete)
      Hooks.on('updateCombat', GurpsActiveEffect._updateCombat)

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
    if (getProperty(data, 'flags.gurps.effect.endCondition'))
      setProperty(data, 'duration.otf', getProperty(data, 'flags.gurps.effect.endCondition'))
    // if (data.duration && !data.duration.combat && game.combat) data.duration.combat = game.combats?.active?.id
  }

  /**
   * After creation of the ActiveEffect.
   * @param {ActiveEffect} effect
   * @param {ActiveEffectData} _data
   * @param {*} _userId
   */
  static async _create(effect, _data, _userId) {
    if (this.gurpsData?.requiresConfig === true) {
      await effect.sheet.render(true)
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
          if (await effect.isExpired()) {
            ui.notifications.info(
              `${i18n('GURPS.effectExpired', 'Effect has expired: ')} '[${i18n(effect.data.label)}]'`
            )
            if (
              GurpsActiveEffect.autoremove
              // game.settings.get(SYSTEM_NAME, ACTIVE_EFFECT_AUTOREMOVE)
            )
              effect.delete()
          }
        }
      }
    }
  }

  static get autoremove() {
    return game.settings.get(SYSTEM_NAME, ACTIVE_EFFECT_AUTOREMOVE)
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
    return this.gurpsData?.endCondition
  }

  set endCondition(otf) {
    let effectFlags = this.gurpsData ?? {}
    effectFlags.endCondition = otf
    gurpsData = effectFlags
    if (!!otf) {
      this.setFlag('core', 'statusId', `${this.name}-endCondition`)
    }
  }

  get gurpsData() {
    return this.getFlag('gurps', 'effect')
  }

  set gurpsData(data) {
    this.setFlag('gurps', 'effect', data)
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

  // TODO Any ActiveEffect with a flags.core.statusId is by default a temporary effect and will be added as an icon to the token.

  async isExpired() {
    if (getProperty(this, 'duration.duration') && getProperty(this, 'duration.remaining') <= 1) return true

    if (!!this.endCondition) {
      let action = parselink(this.endCondition)

      if (getProperty(action, 'type') !== 'modifier')
        return await GURPS.performAction(action.action, this.parent, {
          shiftKey: false,
          ctrlKey: false,
          data: {},
        })
      else return this._badEndCondition(this.endCondition)
    }

    return false
  }

  _badEndCondition(endCondition) {
    ui.notifications.warn(
      `${i18n('GURPS.effectBadEndCondition', 'End Condition is not a skill or attribute test: ')} '[${endCondition}]'`
    )
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
