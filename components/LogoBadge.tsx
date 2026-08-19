'use client';

import { useState } from 'react';

// The Google favicon endpoint is a useful fallback, but several schools only
// expose a tiny bitmap there. These are the sharper assets approved in the
// browse mockup. Raster overrides are stored locally as WebP so their format,
// quality, and availability stay consistent. Vector logos remain SVG because
// they render more sharply than any raster conversion.
const HIGH_RES_LOGOS: Record<string, string> = {
  'harvard.edu': '/mockup-assets/university-logos/harvard.webp',
  'yale.edu': '/mockup-assets/university-logos/yale.webp',
  'princeton.edu': '/mockup-assets/university-logos/princeton.webp',
  'mit.edu': '/mockup-assets/university-logos/mit.webp',
  'brown.edu': '/mockup-assets/university-logos/brown.webp',
  'cornell.edu': '/mockup-assets/university-logos/cornell.webp',
  'upenn.edu': '/mockup-assets/university-logos/upenn.webp',
  'berkeley.edu': '/mockup-assets/university-logos/berkeley.webp',
  'northwestern.edu': '/mockup-assets/university-logos/northwestern.webp',
  'rice.edu': '/mockup-assets/university-logos/rice.webp',
  'emory.edu': '/mockup-assets/university-logos/emory.webp',
  'usc.edu': '/mockup-assets/university-logos/usc.webp',
  'tufts.edu': '/mockup-assets/university-logos/tufts.webp',
  'bc.edu': '/mockup-assets/university-logos/bc.webp',
  'northeastern.edu': '/mockup-assets/university-logos/northeastern.webp',
  'rochester.edu': '/mockup-assets/university-logos/rochester.webp',
  'washington.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Washington_Huskies_logo.svg',
  'nyu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/New_York_University_Seal.svg',
  'sandiego.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/San_Diego_Toreros_logo.svg',
  'umn.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Minnesota_Golden_Gophers_logo.svg',
  'middlebury.edu': '/mockup-assets/university-logos/middlebury.webp',
  'temple.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Temple_T_logo.svg',
  'drexel.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Drexel_Dragons_wordmark.svg',
  'gsu.edu': '/mockup-assets/university-logos/georgia-state.webp',
  'sacredheart.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sacred_Heart_Pioneers_logo.svg',
  'ucsb.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/UC_Santa_Barbara_logo.svg',
  'uci.edu': '/mockup-assets/university-logos/uci.webp',
  'wisc.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wisconsin_Badgers_logo.svg',
  'uic.edu': '/mockup-assets/university-logos/uic.webp',
  'miami.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Miami_Hurricanes_logo.svg',
  'vanderbilt.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Vanderbilt_Commodores_%282022%29_logo.svg',
  'ucmerced.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The_University_of_California_1868_Merced.svg',
  'uga.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Georgia_Athletics_logo.svg',
  'cmu.edu': '/mockup-assets/university-logos/carnegie-mellon.webp',
  'tulane.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Tulane_University_Logo.svg',
  'uchicago.edu': '/mockup-assets/university-logos/uchicago-seal.webp',
  'case.edu': '/mockup-assets/university-logos/case-western.webp',
  'fsu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Florida_State_Seminoles_baseball_logo.svg',
  'stanford.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Stanford_Cardinal_logo.svg',
  'columbia.edu': '/mockup-assets/university-logos/columbia-university.webp',
  'jhu.edu': '/mockup-assets/university-logos/johns-hopkins-university.webp',
  'asu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Arizona_State_Sun_Devils_baseball_logo.svg',
  'wfu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wake_Forest_University_Athletic_logo.svg',
  'ucla.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/UCLA_Bruins_primary_logo.svg',
  'fordham.edu': '/mockup-assets/university-logos/fordham.webp',
  'ufl.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Florida_Gators_script_logo.svg',
  'colorado.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Colorado_Buffaloes_alternate_logo.svg',
  'umich.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Michigan_Wolverines_logo.svg',
  'msu.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Michigan_State_Spartans_alternate_logo.svg',
  'umb.edu': '/mockup-assets/university-logos/umass-boston.webp',
  'lehigh.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lehigh_Mountain_Hawks_monogram_plain_brown.svg',
  'ucdavis.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/ucdavisaggies.com/images/responsive_2022/logo_main.svg',
  'bu.edu': '/mockup-assets/university-logos/boston-university.webp',
  'tcd.ie': 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Trinity_College_Dublin_Arms.svg',
  'gatech.edu': '/mockup-assets/university-logos/georgia-tech.webp',
  'illinois.edu': '/mockup-assets/university-logos/illinois.webp',
  'umd.edu': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Maryland_Terrapins_logo.svg',
  'unc.edu': '/mockup-assets/university-logos/unc.webp',
  'utexas.edu': '/mockup-assets/university-logos/utexas.webp',
  'tamu.edu': '/mockup-assets/university-logos/tamu.webp',
  'purdue.edu': '/mockup-assets/university-logos/purdue.webp',
  'psu.edu': '/mockup-assets/university-logos/psu.webp',
  'ncsu.edu': '/mockup-assets/university-logos/ncsu.webp',
  'iastate.edu': '/mockup-assets/university-logos/iastate.webp',
  'auburn.edu': '/mockup-assets/university-logos/auburn.webp',
  'bates.edu': '/mockup-assets/university-logos/bates.webp',
  'vt.edu': 'https://upload.wikimedia.org/wikipedia/commons/6/60/Virginia_Tech_Hokies_logo.svg',
  'ucsd.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/ucsdtritons.com/images/responsive_2020/logo_scrollstick.svg',
  'indiana.edu': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Indiana_Hoosiers_logo.svg',
  'osu.edu': 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Ohio_State_Buckeyes_logo.svg',
  'ucr.edu': 'https://upload.wikimedia.org/wikipedia/commons/2/21/UC_Riverside_Highlanders_logo.svg',
  'villanova.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/villanova.com/images/logo-main-blue.svg',
  'virginia.edu': '/mockup-assets/university-logos/virginia.webp',
  'binghamton.edu': 'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/binghamton.sidearmsports.com/images/responsive_2022/logo-main.svg',
};

export function universityLogoSrc(domain?: string): string | undefined {
  return domain ? HIGH_RES_LOGOS[domain] : undefined;
}

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
 * Unknown schools keep the monogram instead of loading an inconsistent remote
 * bitmap. If a mapped logo fails, the image is hidden and the letter remains.
 */
export default function LogoBadge({ domain, letter, color, school, size, fontSize }: LogoBadgeProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const logoSrc = universityLogoSrc(domain);

  return (
    <div
      className={`badge${loaded ? ' has-logo' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${fontSize}px` }}
    >
      {logoSrc && !errored && (
        <img
          className={`badge-logo badge-logo-hires${domain === 'binghamton.edu' ? ' badge-logo-binghamton' : ''}`}
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
