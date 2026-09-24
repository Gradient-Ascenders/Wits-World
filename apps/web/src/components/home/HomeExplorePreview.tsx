import { ArrowRightIcon, MapPinIcon } from '@phosphor-icons/react';

import campusPreview from '../../assets/home/campus.png';

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
          src={campusPreview}
          width="1448"
        />

        <a
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
        </a>
      </div>
    </figure>
  );
}
