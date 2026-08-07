import * as React from 'react'

import { Image } from '../../../models/diff'
import { SingleImageDiff } from './single-image-diff'

interface INewImageDiffProps {
  readonly current: Image
  readonly renderCodeDiff?: () => React.ReactNode
}

/** A component to render when a new image has been added to the repository */
export class NewImageDiff extends React.Component<INewImageDiffProps> {
  public render() {
    return (
      <SingleImageDiff
        image={this.props.current}
        status="Added"
        renderCodeDiff={this.props.renderCodeDiff}
      />
    )
  }
}
