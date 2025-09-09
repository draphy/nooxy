import { googleTag } from '../helpers/config'
import { NooxySiteConfigFull } from '../types'

export class HeadRewriter {
  siteConfig: NooxySiteConfigFull

  constructor(siteConfig: NooxySiteConfigFull) {
    this.siteConfig = siteConfig
  }

  element(element: Element) {
    const { googleFont, customHeadJS, customHeadCSS, googleTagID } = this.siteConfig
    const GOOGLE_TAG_ID_JS_STRING = googleTag(googleTagID)
    if (googleFont) {
      element.append(
        `<link href='https://fonts.googleapis.com/css?family=${googleFont.replace(
          ' ',
          '+',
        )}:Regular,Bold,Italic&display=swap' rel='stylesheet'>
          <style>* { font-family: "${googleFont}" !important; }</style>`,
        {
          html: true,
        },
      )
    }

    element.append(
      `<style>
        div.notion-topbar > div > div:nth-child(3) { display: none !important; }
        div.notion-topbar > div > div:nth-child(4) { display: none !important; }
        div.notion-topbar > div > div:nth-child(5) { display: none !important; }
        div.notion-topbar > div > div:nth-child(6) { display: none !important; }
        div.notion-topbar > div > div:nth-child(7) { display: none !important; }
        div.notion-topbar > div > div:nth-child(1n).toggle-mode { display: block !important; }
        
        div.notion-topbar-mobile > div:nth-child(3) { display: none !important; }
        div.notion-topbar-mobile > div:nth-child(4) { display: none !important; }
        div.notion-topbar-mobile > div:nth-child(7) { display: none !important; }
        div.notion-topbar-mobile > div:nth-child(1n).toggle-mode { display: block !important; }
        ${customHeadCSS ?? ''}
        </style>
        ${GOOGLE_TAG_ID_JS_STRING}
        <script>
        ${customHeadJS ?? ''}
        </script>
        `,
      {
        html: true,
      },
    )
  }
}
