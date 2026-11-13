export type KeyboardSource = 'visualViewport' | 'native' | 'none'

export type KeyboardState = {
  open: boolean
  source: KeyboardSource
  height: number
  visualHeight: number
}

export function computeKeyboardState(args: {
  innerHeight: number
  vvHeight: number
  vvOffsetTop: number
  innerWidth: number
  nativeIme: number
}): KeyboardState
