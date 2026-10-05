import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; message: string; retry: string }

export class PaymentBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="vn-checkout-panel" role="alert">
      <p className="vn-checkout-error">{this.props.message}</p>
      <button className="vn-checkout-secondary" type="button" onClick={() => this.setState({ failed: false })}>{this.props.retry}</button>
    </div>;
  }
}
