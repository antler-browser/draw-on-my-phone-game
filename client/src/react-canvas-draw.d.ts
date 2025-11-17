declare module 'react-canvas-draw' {
  import { Component } from 'react'

  interface CanvasDrawProps {
    ref?: any
    brushColor?: string
    brushRadius?: number
    canvasWidth?: number
    canvasHeight?: number
    lazyRadius?: number
    hideGrid?: boolean
    hideInterface?: boolean
    disabled?: boolean
  }

  export default class CanvasDraw extends Component<CanvasDrawProps> {
    clear(): void
    undo(): void
    getSaveData(): string
    loadSaveData(data: string, immediate?: boolean): void
  }
}
