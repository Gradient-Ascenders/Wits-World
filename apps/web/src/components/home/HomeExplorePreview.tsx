import { ArrowRightIcon, MapPinIcon } from '@phosphor-icons/react';
import { Link } from 'wouter';

import campus480 from '../../assets/home/campus-transparent-480.webp';
import campus768 from '../../assets/home/campus-transparent-768.webp';
import campus1152 from '../../assets/home/campus-transparent-1152.webp';
import campusPreview from '../../assets/home/campus-transparent-1448.webp';

export function HomeExplorePreview() {
  return (
    <figure className="home-campus-preview">
      <div className="home-campus-preview__art">
        <img
          alt="Illustrated bird's-eye view of Wits campus with Great Hall at the centre and map beacons around nearby buildings."
          className="home-campus-preview__image"
          decoding="async"
          height="1086"
          loading="lazy"
          sizes="auto, (min-width: 64rem) calc((min(100vw - 6rem, 80rem) - clamp(2rem, 5vw, 5rem)) * 0.656109 + 3rem), (min-width: 48rem) min(52rem, calc(100vw - 6rem)), min(52rem, calc(100vw - 3rem))"
          src={campusPreview}
          srcSet={`${campus480} 480w, ${campus768} 768w, ${campus1152} 1152w, ${campusPreview} 1448w`}
          width="1448"
        />

        <Link
          aria-label="Explore campus from Great Hall"
          className="home-campus-preview__destination"
          href="/explore"
        >
          <span className="home-campus-preview__destination-icon">
            <MapPinIcon aria-hidden="true" size={20} weight="fill" />
          </span>
          <span>
            <strong>Great Hall</strong>
            <small>Start exploring</small>
          </span>
          <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
        </Link>
      </div>
    </figure>
  );
}
