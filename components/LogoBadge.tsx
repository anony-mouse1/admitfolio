'use client';

import { useState } from 'react';

// The Google favicon endpoint is a useful fallback, but several schools only
// expose a tiny bitmap there. These are the sharper assets approved in the
// browse mockup. Local files are used for the two logos Fatimah supplied.
const HIGH_RES_LOGOS: Record<string, string> = {
  'washington.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Washington_Huskies_logo.svg',
  'nyu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/New_York_University_Seal.svg',
  'sandiego.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/San_Diego_Toreros_logo.svg',
  'umn.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Minnesota_Golden_Gophers_logo.svg',
  'middlebury.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Middlebury_athletics_secondlogo.png',
  'temple.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Temple_T_logo.svg',
  'drexel.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Drexel_Dragons_wordmark.svg',
  'gsu.edu': 'https://commkit.gsu.edu/files/2021/05/GSU-Athletics-Pantherhead-2C-RGB.png',
  'sacredheart.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sacred_Heart_Pioneers_logo.svg',
  'ucsb.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/UC_Santa_Barbara_logo.svg',
  'wisc.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wisconsin_Badgers_logo.svg',
  'uic.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Uic_flames_sec_logo_2020.png',
  'miami.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Miami_Hurricanes_logo.svg',
  'vanderbilt.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Vanderbilt_Commodores_%282022%29_logo.svg',
  'ucmerced.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The_University_of_California_1868_Merced.svg',
  'uga.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Georgia_Athletics_logo.svg',
  'cmu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/CMU_logo_stack_cmyk_red.jpg',
  'tulane.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Tulane_University_Logo.svg',
  'uchicago.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chicago_Maroons_logo.svg',
  'case.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Crwu_spartans_logo.png',
  'fsu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Florida_State_Seminoles_baseball_logo.svg',
  'stanford.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Stanford_Cardinal_logo.svg',
  'columbia.edu': '/mockup-assets/university-logos/columbia-university.jpg',
  'jhu.edu': '/mockup-assets/university-logos/johns-hopkins-university.webp',
  'asu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Arizona_State_Sun_Devils_baseball_logo.svg',
  'wfu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wake_Forest_University_Athletic_logo.svg',
  'ucla.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/UCLA_Bruins_primary_logo.svg',
  'fordham.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Fordham_Rams_F_Logo.png',
  'ufl.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Florida_Gators_script_logo.svg',
  'colorado.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Colorado_Buffaloes_alternate_logo.svg',
  'msu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Michigan_State_Spartans_alternate_logo.svg',
  'umb.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Umass_boston_seal.png',
  'lehigh.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lehigh_Mountain_Hawks_monogram_plain_brown.svg',
  'ucdavis.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/ucdavisaggies.com/images/responsive_2022/logo_main.svg',
  'bu.edu': 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Boston_University_Square_Logo.png',
  'tcd.ie': 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Trinity_College_Dublin_Arms.svg',
  'gatech.edu': 'https://brand.gatech.edu/sites/default/files/inline-images/GTVertical_RGB_0.png',
  'vt.edu': 'https://upload.wikimedia.org/wikipedia/commons/6/60/Virginia_Tech_Hokies_logo.svg',
  'ucsd.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/ucsdtritons.com/images/responsive_2020/logo_scrollstick.svg',
  'indiana.edu': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Indiana_Hoosiers_logo.svg',
  'osu.edu': 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Ohio_State_Buckeyes_logo.svg',
  'ucr.edu': 'https://upload.wikimedia.org/wikipedia/commons/2/21/UC_Riverside_Highlanders_logo.svg',
  'villanova.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/villanova.com/images/logo-main-blue.svg',
  'virginia.edu': 'https://brand.virginia.edu/sites/uva_brand/files/2023-07/72_UVALogo_800x800.jpg',
  'binghamton.edu': 'https://www.binghamton.edu/communications-and-marketing/img/logos/B-symbol-2c.jpg',
};

type LogoBadgeProps = {
  domain?: string;
  letter: string;
  color: string;
  school: string;
  size: number;
  fontSize: number;
};

/**
 * Colored monogram badge with an optional real university logo overlay.
 * If the favicon fails to load, the <img> is hidden and the letter shows
 * through - mirrors the original onerror/onload behavior.
 */
export default function LogoBadge({ domain, letter, color, school, size, fontSize }: LogoBadgeProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const sharpLogo = domain ? HIGH_RES_LOGOS[domain] : undefined;
  const logoSrc = domain ? sharpLogo || `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : undefined;

  return (
    <div
      className={`badge${loaded ? ' has-logo' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${fontSize}px` }}
    >
      {logoSrc && !errored && (
        <img
          className={`badge-logo${sharpLogo ? ' badge-logo-hires' : ''}${domain === 'binghamton.edu' ? ' badge-logo-binghamton' : ''}`}
          src={logoSrc}
          alt={`${school} logo`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
      {letter}
    </div>
  );
}
