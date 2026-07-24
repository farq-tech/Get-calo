const {
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix onnxruntime-react-native EAS Gradle failures:
 * - Pin Maven AAR (avoid latest.integration metadata fetch)
 * - Force JDK XML parsers (SAXNotRecognizedException on Gradle 8.4+)
 */
function withOnnxruntimeEasFix(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = [
      {
        type: 'property',
        key: 'systemProp.javax.xml.parsers.SAXParserFactory',
        value: 'com.sun.org.apache.xerces.internal.jaxp.SAXParserFactoryImpl',
      },
      {
        type: 'property',
        key: 'systemProp.javax.xml.transform.TransformerFactory',
        value: 'com.sun.org.apache.xalan.internal.xsltc.trax.TransformerFactoryImpl',
      },
      {
        type: 'property',
        key: 'systemProp.javax.xml.parsers.DocumentBuilderFactory',
        value: 'com.sun.org.apache.xerces.internal.jaxp.DocumentBuilderFactoryImpl',
      },
    ];
    for (const prop of props) {
      const existing = cfg.modResults.findIndex(
        (item) => item.type === 'property' && item.key === prop.key
      );
      if (existing >= 0) cfg.modResults[existing] = prop;
      else cfg.modResults.push(prop);
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const candidates = [
        path.join(
          cfg.modRequest.projectRoot,
          'node_modules/onnxruntime-react-native/android/build.gradle'
        ),
        path.join(
          cfg.modRequest.projectRoot,
          '../node_modules/onnxruntime-react-native/android/build.gradle'
        ),
      ];
      for (const gradlePath of candidates) {
        if (!fs.existsSync(gradlePath)) continue;
        let contents = fs.readFileSync(gradlePath, 'utf8');
        const pinned = contents.replace(
          /com\.microsoft\.onnxruntime:onnxruntime-android(-qnn)?:latest\.integration@aar/g,
          'com.microsoft.onnxruntime:onnxruntime-android$1:1.23.2@aar'
        );
        if (pinned !== contents) {
          fs.writeFileSync(gradlePath, pinned);
        }
      }
      return cfg;
    },
  ]);

  return config;
}

module.exports = withOnnxruntimeEasFix;
