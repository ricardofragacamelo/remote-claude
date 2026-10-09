/// Who hears a page stacked over another and taken off it.
///
/// One observer for the app's navigator, so a screen can know it is covered — the session, which
/// tells the platform which session is on screen, and stops saying it while another page is on top
/// of it (plan 25, B-08, D-11). Pages only: a sheet or a dialog leaves the screen under it in view.
library;

import 'package:flutter/widgets.dart';

/// The observer the router installs and a covered screen subscribes to.
final RouteObserver<PageRoute<void>> pageObserver = RouteObserver<PageRoute<void>>();

/// A screen that hears the pages stacked over it: subscribed to [pageObserver] while it has a page,
/// unsubscribed when it goes. The screen overrides `didPushNext` and `didPopNext` (B-08, B-18).
mixin PageAware<T extends StatefulWidget> on State<T>, RouteAware {
  PageRoute<void>? _page;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final ModalRoute<Object?>? route = ModalRoute.of(context);
    if (route is PageRoute<void> && route != _page) {
      pageObserver.unsubscribe(this);
      _page = route;
      pageObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    pageObserver.unsubscribe(this);
    super.dispose();
  }
}
