import * as React from 'react'

import { Image } from '../../../models/diff'
import { SingleImageDiff } from './single-image-diff'

interface IDeletedImageDiffProps {
  readonly previous: Image
  readonly renderCodeDiff?: () => React.ReactNode
}

/** A component to render when the file has been deleted from the repository */
export class DeletedImageDiff extends React.Component<IDeletedImageDiffProps> {
  public render() {
    return (
      <SingleImageDiff
        image={this.props.previous}
        status="Deleted"
        renderCodeDiff={this.props.renderCodeDiff}
      />
    )
  }
}
