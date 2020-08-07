import { Module } from './modules/module'
import { vnode, VNode } from './vnode'
import * as is from './is'
import { htmlDomApi, DOMAPI } from './htmldomapi'

type NonUndefined<T> = T extends undefined ? never : T

function isUndef (s: any): boolean {
  return s === undefined
}
function isDef<A> (s: A): s is NonUndefined<A> {
  return s !== undefined
}

type VNodeQueue = VNode[]

const emptyNode = vnode('', {}, [], undefined, undefined)

function sameVnode (vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel
}

function isVnode (vnode: any): vnode is VNode {
  return vnode.sel !== undefined
}

type KeyToIndexMap = {[key: string]: number}

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
}

type ModuleHooks = ArraysOf<Required<Module>>

function createKeyToOldIdx (children: VNode[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {}
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key
    if (key !== undefined) {
      map[key] = i
    }
  }
  return map
}
// 存储钩子函数的名称
const hooks: Array<keyof Module> = ['create', 'update', 'remove', 'destroy', 'pre', 'post']

export function init (modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number
  let j: number
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: []
  }
  // 初始化转换虚拟节点的 api
  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi
  // 把传入的所有模块的钩子函数，统一存储到 cbs 对象中
  // 最终构建的 cbs 对象的形式 cbs = { create: [fn1, fn2], update: [], ...}
  for (i = 0; i < hooks.length; ++i) {
    // cbs.create = [] cbs.update = [] ...
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      // modules 传入的模块数组
      // 获取模块中的 hook 函数
      // hook = modules[0][create] ....
      const hook = modules[j][hooks[i]]
      if (hook !== undefined) {
        // 把获取到的 hook 函数放入到 cbs 对应的钩子函数数组中
        (cbs[hooks[i]] as any[]).push(hook)
      }
    }
  }
  
  function emptyNodeAt(elm: Element) {
    // 如果元素有 id 在前面加上 # 号 例如：#app
    const id = elm.id ? '#' + elm.id : ''
    // 如果元素有 class 类 在前面加上 . 例如： .container
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''
    // 将元素的标签和 id 和 class 结合起来作为 vnode 的 sel ，例如：div#app.container
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm)
  }

  function createRmCb (childElm: Node, listeners: number) {
    // 返回删除元素的回调函数
    return function rmCb () {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node
        api.removeChild(parent, childElm)
      }
    }
  }

  function createElm (vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any
    let data = vnode.data
    if (data !== undefined) {
      // 执行用户设置的 init 钩子函数
      const init = data.hook?.init
      if (isDef(init)) {
        init(vnode)
        // 这个 init 是用户传递的，在这个函数中有可能会修改 data 的值
        // 所有有必要再赋值一次
        data = vnode.data
      }
    }
    // 把 vnode 转换成真实 DOM 对象（没有渲染到页面）
    const children = vnode.children
    const sel = vnode.sel
    // 如果 sel 是感叹号，会创建注释节点
    if (sel === '!') {
      if (isUndef(vnode.text)) {
        vnode.text = ''
      }
      // 创建注释节点
      vnode.elm = api.createComment(vnode.text!)
      // 如果 sel 不等于 undefined 会创建对应的 DOM 元素
    } else if (sel !== undefined) {
      // Parse selector
      // 如果选择器不为空
      // 解析选择器
      // 解析 # 号和 . （id 选择器和类选择器）
      const hashIdx = sel.indexOf('#')
      const dotIdx = sel.indexOf('.', hashIdx)
      const hash = hashIdx > 0 ? hashIdx : sel.length
      const dot = dotIdx > 0 ? dotIdx : sel.length
      // 解析标签名
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel
      const elm = vnode.elm = isDef(data) && isDef(i = data.ns)
        // 如果 data 有定义并且有命名空间会创建带有命名空间的标签 ，通常情况下是 svg
        ? api.createElementNS(i, tag)
        // 创建普通元素
        : api.createElement(tag)
      // 给 dom 元素设置 id选择器
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot))
      // 给 dom 元素设置 class 选择器
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '))
      // 执行模块的 create 钩子函数
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode)
      // 如果 vnode 中有子节点，创建子节点 对应的 DOM 元素并追加到 DOM　树　上
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i]
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue))
          }
        }
      } else if (is.primitive(vnode.text)) {
        // 如果 vnode 的值是 string/number  创建文本节点并追加到 DOM　树
        api.appendChild(elm, api.createTextNode(vnode.text))
      }
      const hook = vnode.data!.hook
      if (isDef(hook)) {
        // 执行用户传入的钩子函数 create
        hook.create?.(emptyNode, vnode)
        if (hook.insert) {
          // 把 vnode 添加到队列中，为后续执行 insert 钩子做准备
          insertedVnodeQueue.push(vnode)
        }
      }
    } else {
      // 如果选择器为空，创建文本节点
      vnode.elm = api.createTextNode(vnode.text!)
    }
    // 返回新创建的 DOM
    return vnode.elm
  }

  function addVnodes (
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before)
      }
    }
  }

  function invokeDestroyHook (vnode: VNode) {
    const data = vnode.data
    if (data !== undefined) {
      // 执行用户设置的 destroy 钩子函数
      data?.hook?.destroy?.(vnode)
      // 调用模块的 destroy 钩子函数
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
      // 执行子节点中的 destroy 函数
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j]
          if (child != null && typeof child !== 'string') {
            invokeDestroyHook(child)
          }
        }
      }
    }
  }

  function removeVnodes (parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number
      let rm: () => void
      // 获取 vnode 中的元素，赋值到 ch 中
      const ch = vnodes[startIdx]
      if (ch != null) {
        // 如果 sel 有值
        if (isDef(ch.sel)) {
          // 执行 destroy 钩子函数（执行所有子节点的 destroy 钩子函数）
          invokeDestroyHook(ch)
          // remove 函数的个数
          listeners = cbs.remove.length + 1
          // 创建删除的回调函数
          rm = createRmCb(ch.elm!, listeners)
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm)
          const removeHook = ch?.data?.hook?.remove
          // 执行用户设置的 remove 函数
          if (isDef(removeHook)) {
            removeHook(ch, rm)
          } else {
            // 如果用户没有传入 remove 钩子函数，直接调用删除元素的方法
            rm()
          }
        } else { // Text node
          // 如果是文本节点，直接删除节点
          api.removeChild(parentElm, ch.elm!)
        }
      }
    }
  }

  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    let oldStartIdx = 0 // 老节点开始索引
    let newStartIdx = 0 // 新节点开始索引
    let oldEndIdx = oldCh.length - 1 // 老节点结束索引
    let oldStartVnode = oldCh[0] // 老开始节点
    let oldEndVnode = oldCh[oldEndIdx] // 老结束节点
    let newEndIdx = newCh.length - 1 // 新节点结束索引
    let newStartVnode = newCh[0] // 新开始节点
    let newEndVnode = newCh[newEndIdx] // 新结束节点
    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 索引变化后，可能会把节点设置为空
      if (oldStartVnode == null) {
        // 节点为空，移动索引
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]
        // 比较开始和结束节点的四种情况
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 1. 比较老开始节点和新的开始节点
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 2. 比较老结束节点和新的结束节点
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 3. 比较老开始节点和新结束节点
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        // 比较老结束节点和新开始节点
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 开始节点和结束节点都不相同
        // 使用 newStartVnode 的 key 在老节点数组中查找相同接单
        // 先设置记录 key 和 index 的对象
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        // 遍历 newStartVnode,从老节点中找相同 key 的 oldVnode 的索引
        idxInOld = oldKeyToIdx[newStartVnode.key as string]
        // 如果是新的 vnode
        if (isUndef(idxInOld)) { // New element
          // 如果没有找到，newStartVnode 是新节点
          // 创建元素 插入 DOM 树
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else {
          // 如果找到相同 key 的老节点，记录到 elmToMove 遍历
          elmToMove = oldCh[idxInOld]
          if (elmToMove.sel !== newStartVnode.sel) {
            // 如果新旧节点的选择器不同
            // 创建新开始节点对应的 DOM 元素，插入到 DOM 中
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            // 如果相同，patchVnode()
            // 把elmToMove 对应的  DOM 元素，移动到左边
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined as any
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!)
          }
        }
        // 重新给 newStartVnode 赋值，指向下一个新节点
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 循环结束，老节点数组先遍历完成或者新节点数组先遍历完成
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        // 如果老节点数组先遍历完成，说明有新的剩余节点
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        // 把剩余的新节点都插入到老节点右侧
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else {
        // 入股新节点先遍历完成，说明老节点有剩余
        // 批量删除老节点
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
      }
    }
  }

  function patchVnode (oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    const hook = vnode.data?.hook
    // 首先执行用户设置的 prepatch 钩子函数
    hook?.prepatch?.(oldVnode, vnode)
    const elm = vnode.elm = oldVnode.elm!
    const oldCh = oldVnode.children as VNode[]
    const ch = vnode.children as VNode[]
    // 如果新老 vnode 相同
    if (oldVnode === vnode) return
    if (vnode.data !== undefined) {
      // 执行模块的 update 钩子函数
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // 执行用户设置的 update 钩子函数
      vnode.data.hook?.update?.(oldVnode, vnode)
    }
    // 如果 vnode.text 未定义
    if (isUndef(vnode.text)) {
      // 如果新老节点都有 children
      if (isDef(oldCh) && isDef(ch)) {
        // 两个节点的 children 不同，使用 diff 算法对比并更新差异
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue)
      } else if (isDef(ch)) {
        // 如果新节点有 children，老节点没有children
        // 如果老节点有 text,清空 DOM 元素的内容
        if (isDef(oldVnode.text)) api.setTextContent(elm, '')
        // 批量添加子节点
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 如果老节点有 children，新节点没有 children
        // 批量移除子节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 如果老节点有 text 清空 DOM 元素
        api.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 如果 text 不同
      if (isDef(oldCh)) {
        // 如果老节点有 children ，移除
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }
      // 设置 DOM 元素的 textContent 为 vnode.text
      api.setTextContent(elm, vnode.text!)
    }
    // 执行用户设置的 postpatch 钩子函数
    hook?.postpatch?.(oldVnode, vnode)
  }
  // 返回 patch 函数，把 vnode 渲染成真实 dom，并返回 vnode
  return function patch (oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node
    // 保存新插入节点的队列，为了触发钩子函数
    const insertedVnodeQueue: VNodeQueue = []
    // 执行模块中的 pre 钩子函数
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]()
    // 如果 oldVnode 不是 vnode, 创建 VNode 并设置 elm
    if (!isVnode(oldVnode)) {
      // 把 DOM 元素转换成空的 VNode
      oldVnode = emptyNodeAt(oldVnode)
    }
    // 如果新旧节点是相同的节点 （key 和 sel 相同）
    if (sameVnode(oldVnode, vnode)) {
      // 查找节点的差异并更新 DOM
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else {
      // 如果新旧节点不同，vnode 创建对应的 DOM
      // 获取当前的 DOM 元素
      // ！的意思是保证这个值不为空，一定存在
      elm = oldVnode.elm!
      parent = api.parentNode(elm) as Node
      // 创建 vnode 对应的 DOM 元素，并触发 init/create 钩子函数
      createElm(vnode, insertedVnodeQueue)

      if (parent !== null) {
        // 如果父节点不为空，把 vnode 对应的 DOM 插入到文档中
        // 将 元素放在 elm 元素的后面
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm))
        // 移除老节点
        removeVnodes(parent, [oldVnode], 0, 0)
      }
    }
    // 执行用户设置的 insert 钩子函数
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i])
    }
    // 执行模块的 post 钩子函数
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]()
    // 返回 vnode
    return vnode
  }
}
