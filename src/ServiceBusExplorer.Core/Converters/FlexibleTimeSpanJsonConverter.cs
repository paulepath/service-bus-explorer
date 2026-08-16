using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml;

namespace ServiceBusExplorer.Core.Converters;

public class FlexibleTimeSpanJsonConverter : JsonConverter<TimeSpan>
{
    public override TimeSpan Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number)
        {
            return TimeSpan.FromSeconds(reader.GetDouble());
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str))
            {
                return TimeSpan.Zero;
            }

            // 1. Try TimeSpan.TryParse standard ("00:01:00", "01:00:00", "1.00:00:00")
            if (TimeSpan.TryParse(str, CultureInfo.InvariantCulture, out var ts))
            {
                return ts;
            }

            // 2. Try numeric string ("60")
            if (double.TryParse(str, NumberStyles.Any, CultureInfo.InvariantCulture, out var seconds))
            {
                return TimeSpan.FromSeconds(seconds);
            }

            // 3. Try ISO-8601 Duration ("PT1M", "PT60S", "PT1H")
            try
            {
                return XmlConvert.ToTimeSpan(str);
            }
            catch { }
        }

        throw new JsonException($"Unable to convert \"{reader.GetString()}\" to TimeSpan.");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString("c"));
    }
}

public class NullableFlexibleTimeSpanJsonConverter : JsonConverter<TimeSpan?>
{
    private readonly FlexibleTimeSpanJsonConverter _inner = new();

    public override TimeSpan? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType == JsonTokenType.String && string.IsNullOrWhiteSpace(reader.GetString()))
        {
            return null;
        }

        return _inner.Read(ref reader, typeof(TimeSpan), options);
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            _inner.Write(writer, value.Value, options);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
