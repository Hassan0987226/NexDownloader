class MediaInfo {
  final String? title;
  final int? duration;
  final List<dynamic> formats;
  MediaInfo({this.title, this.duration, this.formats = const []});
  factory MediaInfo.fromJson(Map<String,dynamic> j) => MediaInfo(title:j['title'], duration:j['duration'], formats:j['formats'] ?? []);
}
