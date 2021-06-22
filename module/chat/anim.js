'use strict'

import ChatProcessor from './chat-processor.js'
import { parselink } from '../../lib/parselink.js'
import { i18n, makeRegexPatternFrom, splitArgs, wait} from '../../lib/utilities.js'

const JB2A_PATREON = 'jb2a_patreon'
const JB2A_FREE = 'JB2A_DnD5e'
const JK_ANIM_SPELL = 'animated-spell-effects'
const JK_ANIM_SPELL_CARTOON = 'animated-spell-effects-cartoon'
const JAAMOD = 'jaamod'

let ANIM_LIBRARY = []

Hooks.on('ready', async () => {
  if (!addToLibrary(JB2A_PATREON)) 
    addToLibrary(JB2A_FREE)
  addToLibrary(JK_ANIM_SPELL)
  addToLibrary(JK_ANIM_SPELL_CARTOON)
  addToLibrary(JAAMOD)
})

function addToLibrary(module) {
  if (game.modules.get(module)) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', 'systems/gurps/utils/' + module + '.txt', true);
    xhr.responseType = 'text';
    xhr.onload = function () {
      if (xhr.readyState === xhr.DONE) {
        if (xhr.status === 200) {
          let list = xhr.responseText.split('\n').map(s => s.replace(/^\.\//, ""))
          list = list.map(s => s.replace(/,width=/, ",W:"))
          list = list.map(s => `modules/${module}/${s}`)
          list = list.filter(f => fileWidth(f).width > 0)
          console.log(`Loaded ${list.length} ${module} records`)
          ANIM_LIBRARY = [...ANIM_LIBRARY, ...list]
        }
      }
    }
    xhr.send(null)
    return true
  }
  return false
}

function fileWidth(entry) {
  let m = entry.match(/\.webm,W:(\d+)/)
  if (!!m) return { file: entry.split(",")[0], width: +m[1] }
  console.log("Unknown format: " + entry)
  return { file: '', width: 0 }
}

// stolen from the Ping module
function getMousePos(foundryCanvas) {
  const mouse = foundryCanvas.app.renderer.plugins.interaction.mouse.global;
  const t = foundryCanvas.stage.worldTransform;

  function calcCoord(axis) {
    return (mouse[axis] - t['t' + axis]) / foundryCanvas.stage.scale[axis];
  }

  return {
    x: calcCoord('x'),
    y: calcCoord('y')
  };
}

export class AnimChatProcessor extends ChatProcessor {
  help() {
    return '/anim &lt;stuff&gt;'
  }

  async drawEffect(effect, fromToken, toTokensArray) {
    let used = []
    for (const to of toTokensArray)
      if (effect.centered) 
        used = [...used, ...await this.drawSpecialToward(effect, to, fromToken)]
      else
        used = [...used, ...await this.drawSpecialToward(effect, fromToken, to)]
    return used
  }
  
  randFile(list) {
    let i = Math.floor(Math.random() * list.length)
    return list.splice(i,1)
  }
  
    
  async drawSpecialToward(effect, tok1, tok2) {
    const origin = {
      x: tok1.position.x + tok1.w / 2,
      y: tok1.position.y + tok1.h / 2
    }
    const target = {
      x: tok2.position.x + tok2.w / 2,
      y: tok2.position.y + tok2.h / 2
    }
    // Compute angle
    const deltaX = target.x - origin.x
    const deltaY = target.y - origin.y
    let rotation = effect.centered ? (effect.rotation * Math.PI / 180) : Math.atan2(deltaY, deltaX)
    let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) 
    
    let files = []
    if (effect.centered) 
      files = effect.files.map(f => fileWidth(f))
    else {
      let bestWidth = 0
      let best = 0
      for (const file of effect.files) {
        let f = fileWidth(file)
        let s = distance / f.width
        f.scale = s
        files.push(f)
        if (s >= best && s < 1.0) {
          best = s
          bestWidth = f.width
        }
      }
      if (best == 0) {
        best = Number.MAX_SAFE_INTEGER
        for (const file of files) {
          if (file.scale < best) {
            best = file.scale
            bestWidth = file.width
          }
        }
      }
      files = files.filter(f => f.width == bestWidth)
      this.priv(`Best fit (width:${bestWidth})`)
      files.forEach(f => {
        let p = f.file.split('/').pop()
        this.priv(p)
      })
    }
    let possible = [...files]
    let used = []
    let effects = []
    for (let i = 0; i < effect.count; i++) {
      const effectData = {...effect}
      effectData.position = {
          x: origin.x,
          y: origin.y
        }
      effectData.rotation = rotation
      effectData.distance = distance
      let file = this.randFile(possible)[0]
      if (possible.length == 0) possible = [...files]
      effectData.filedata = file
      effectData.file = file.file
      if (effectData.centered) {
        if (effectData.flip) effectData.scale.x *= -1
      } else {
        let s = (effectData.distance * (1 + effectData.fudge)) / ((1 - effectData.anchor.x) * file.width) 
        effectData.scale = {x: s, y: s * (Math.random() < 0.5 ? -1 : 1)} // randomly flip vert orientation
      }
      effects.push(effectData)
      used.push(effectData.file.split('/').pop())
    }
    this.executeEffects(effect.count, effects) // do NOT await this.
    return used
  }
  
  async executeEffects(count, effects) {
    for (let effectData of effects) {
      count--
      game.socket.emit('module.fxmaster', effectData);
      // Throw effect locally
      canvas.fxmaster.playVideo(effectData)
      console.log(GURPS.objToString(effectData))
      if (count > 0) await wait(effectData.delay)
    }
  }
  
  errorExit(str) {
    ui.notifications.error(str);
    return false
  }
  
  randomInvert(y) {
    return Math.random() < 0.5 ? -1 * y: y  // used to randomize Y scale (give different 'looks' for animation)
  }

  async awaitClick(line) {
    GURPS.IgnoreTokenSelect = true
    return new Promise( (resolve, reject) => {
      window.addEventListener('mousedown', (e) => { 
        let pt = getMousePos(game.canvas)
        e.preventDefault()
        e.stopPropagation()
        let grid_size = canvas.scene.data.grid
        canvas.tokens.targetObjects({
          x: pt.x - grid_size / 2,
          y: pt.y - grid_size / 2,
          height: grid_size,
          width: grid_size,
        releaseOthers: true,
        })
        GURPS.IgnoreTokenSelect = false
        line = line + " @" + parseInt(pt.x) + "," + parseInt(pt.y)
        this.registry.processLine(line)
        resolve()
      }, {once: true})
    })
  }
  
  async displaylist() {
    let list = ANIM_LIBRARY.map(s => s.replace(/modules\//,""))
    list = [ "Total: " + ANIM_LIBRARY.length, ...list]
    
    let t = await renderTemplate('systems/gurps/templates/import-stat-block.html', { block: list.join('\n') })
    //let t = await renderTemplate('systems/gurps/templates/chat-processing.html', { lines: list })
    let d = new Dialog(
      {
        title: `Anim library`,
        content: t,
        buttons: {
           no: {
            icon: '<i class="fas fa-check"></i>',
            label: 'OK',
          },
        },
        default: false,
      },
      {
        width: 1200,
        height: 800,
      }
    )
    d.render(true)
  }

  matches(line) { 
    this.match = line.match(/^\/anim *(?<list>list)? *(?<file>[\S]+)? *(?<center>cf?\d*)? *(?<scale>\*[\d\.]+)? *(?<x>-[\d\.]+)? *(?<fudge>\+[\d.]+)? *(?<count>[\d\.]+[xX])?(?<delay>:[\d\.]+)? *(?<dest>@\d+,\d+)? *(?<self>@(s|self|src)?)?/)   
    return !!this.match
  }
  
  async process(line) {
    if (!canvas.fxmaster) return this.errorExit("This macro depends on the FXMaster module. Make sure it is installed and enabled")
    let files = []
    let m = this.match.groups
    if (ANIM_LIBRARY.length == 0) return this.errorExit("This macro depends on one of the JB2A modules (free or patreon) or Animated Spell Effects. Make sure at least one is installed.")
    if (!!m.list) {
      this.displaylist()
      return true;
    }
    if (!m.file) return this.errorExit("Must provide animation name")
    if (m.file[0] == '/') 
      files = [m.file.substr(1)]
    else {
      let pat = new RegExp(m.file.split('*').join('.*?').replace(/\//g, '\\/'), 'i')
      files = ANIM_LIBRARY.filter(e => e.match(pat))
      if (files.length == 0) return this.errorExit(`Unable to find animation for '${pat}'`)
    }
        
    let opts = []
    let scale = 1.0
    let flip = false
    let centered = false
    var rotation
    if (!!m.center) {
      centered = true
      let t = m.center.match(/c(f)?(\d*)/)
      flip = !!t[1]
      rotation = !!t[2] ? +t[2] : 0
      opts.push("C" + (flip ? "flip":"") + ":" + rotation)
    } else opts.push("T")

    let x = centered ? 0.5 : 0
    let y = 0.5
    let fudge = 0
    let count = 1
    let delay = 1000
    if (!!m.scale) { 
      scale = parseFloat(m.scale.substr(1))  
      opts.push("Scale:" + scale)
      if (!centered) this.priv("Scale option only valid on Centered animation")
    }
    if (!!m.count) {
      count = parseInt(m.count.slice(0, -1))
      opts.push("Count:" + count)
    }
    if (!!m.delay) {
      delay = 1000 * parseFloat(m.delay.substr(1))
      opts.push("Delay:" + m.delay.substr(1))
    }
    if (!!m.x) {
      x = parseFloat(m.x.substr(1))
      opts.push("Start:-" + x)
      if (centered) this.priv("Start option only valid on Targeted animation")
   }
    if (!!m.fudge) {
      fudge = parseFloat(m.fudge.substr(1))
      opts.push("End:+" + fudge)
      if (centered) this.priv("End option only valid on Targeted animation")
   } 
    let srcToken = canvas.tokens.placeables.find(e => e.actor == GURPS.LastActor)
    if (!srcToken) srcToken = canvas.tokens.controlled[0]
    let destTokens = Array.from(game.user.targets)
    if (destTokens.length == 0  && game.user.isGM) destTokens = canvas.tokens.controlled
    if (m.self) destTokens = [ srcToken ]
    if (m.dest) {
      let d = m.dest.substr(1).split(',')
      destTokens = [ {
        name: "User click",
        w: 0,
        h: 0,
        position: {
          x: +d[0],
          y: +d[1]
        }
      }]
    }
    if (destTokens.length == 0) {
      ui.notifications.info("Please click the target location")
      this.send()
      await this.awaitClick((this.msgs().quiet ? '!' : '') + line.replace(/@ *$/,''))
      return true;
    }
    if (!srcToken) srcToken = destTokens[0]    // centered anims should show on target (or selection)
    if (!centered && destTokens.length == 1 && destTokens[0] == srcToken) return this.errorExit("Source and Destination cannot be the same token with using a Targeted animation")
    let effect = {
      files: files,
      anchor: {
        x: x,
        y: y,
      },
      speed: 0,
      angle: 0,
      scale: {
        x: scale,
        y: scale,
      },
      fudge: fudge,
      centered: centered,
      rotation: rotation,
      flip: flip,
      count: count,
      delay: delay
     }
    this.priv("Src:" + srcToken?.name)
    this.priv("Dest:" + destTokens.map(e => e.name))
    this.priv("Opts: " + opts.join(', '))
    this.priv("Possible:")
    this.priv(files.map(e => e.split('/').pop()).join('<br>'))
    let used = await this.drawEffect(effect, srcToken, destTokens)
    this.priv("Used:<br>" + used.join('<br>'))
    this.send()
  }
}