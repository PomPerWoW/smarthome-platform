import React from "react";

/**
 * Catches runtime errors from the 3D scene (e.g. missing/corrupt GLTF assets)
 * so the landing page UI doesn't blank out.
 */
export class ThreeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info);
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}


