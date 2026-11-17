import Foundation
import PencilKit
import UIKit

/// Lossless editing remains in .pkdrawing. This JSON is a portable visual fallback,
/// not a substitute for PKDrawing.dataRepresentation().
enum StrokeJSONExporter {
    struct Point: Codable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
        let force: Double
        let opacity: Double
        let timeOffset: Double
    }

    struct Stroke: Codable {
        let inkType: String
        let color: String
        let points: [Point]
    }

    struct Document: Codable {
        let schema: String
        let version: Int
        let canvasWidth: Double
        let canvasHeight: Double
        let strokes: [Stroke]
    }

    static func export(_ drawing: PKDrawing, canvasSize: CGSize) throws -> Data {
        let strokes = drawing.strokes.map { stroke -> Stroke in
            let color = stroke.ink.color
            var red: CGFloat = 0
            var green: CGFloat = 0
            var blue: CGFloat = 0
            var alpha: CGFloat = 1
            // Normalize dynamic colors before resolving RGB values.
            let resolved = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
            if !resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
                red = 0; green = 0; blue = 0; alpha = 1
            }
            let hex = String(format: "#%02X%02X%02X%02X",
                             Int((red * 255).rounded()),
                             Int((green * 255).rounded()),
                             Int((blue * 255).rounded()),
                             Int((alpha * 255).rounded()))
            let points = stroke.path.map { point in
                Point(x: Double(point.location.x),
                      y: Double(point.location.y),
                      width: Double(point.size.width),
                      height: Double(point.size.height),
                      force: Double(point.force),
                      opacity: Double(point.opacity),
                      timeOffset: Double(point.timeOffset))
            }
            return Stroke(inkType: String(describing: stroke.ink.inkType),
                          color: hex,
                          points: points)
        }

        let document = Document(schema: "cockpid.pencilkit.strokes",
                                version: 1,
                                canvasWidth: Double(canvasSize.width),
                                canvasHeight: Double(canvasSize.height),
                                strokes: strokes)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(document)
    }
}
