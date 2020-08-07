import { vnode, VNode, VNodeData } from './vnode'
import * as is from './is'

export type VNodes = VNode[]
export type VNodeChildElement = VNode | string | number | undefined | null
export type ArrayOrElement<T> = T | T[]
export type VNodeChildren = ArrayOrElement<VNodeChildElement>

function addNS (data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg'
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel)
      }
    }
  }
}

export function h (sel: string): VNode
export function h (sel: string, data: VNodeData | null): VNode
export function h (sel: string, children: VNodeChildren): VNode
export function h (sel: string, data: VNodeData | null, children: VNodeChildren): VNode
export function h (sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {}
  var children: any
  var text: any
  var i: number
  // 处理参数，实现函数的重载
  if (c !== undefined) {
    // 处理三个参数的情况
    // sel、data、children/text
    if (b !== null) {
      data = b
    }
    // 如果是 c 是数组，说明是子元素，存在 children 里
    if (is.array(c)) {
      children = c
      // 如果 c 是字符串或者数字 说明它是标签中的文本
    } else if (is.primitive(c)) {
      text = c
      // 如果 c 是 vnode 那么将 c 转换成数组在赋值给 children
    } else if (c && c.sel) {
      children = [c]
    }
    // 处理两个参数的情况
  } else if (b !== undefined && b !== null) {
    // 如果 b 是数组
    if (is.array(b)) {
      children = b
      // 如果 b 是字符串或者数字
    } else if (is.primitive(b)) {
      text = b
      // 如果 b 是 vnode
    } else if (b && b.sel) {
      children = [b]
    } else { data = b }
  }
  if (children !== undefined) {
    // 处理 children 中的原始值 (string|number)
    for (i = 0; i < children.length; ++i) {
      // 如果 child 是 string/number 创建文本节点
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined)
    }
  }
  // 如果选择器传的是 svg，添加 命名空间
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    addNS(data, children, sel)
  }
  // 返回 vnode
  return vnode(sel, data, children, text, undefined)
};
