using MasterMemory;

[assembly: MasterMemoryGeneratorOptions(Namespace = "Masterdata.Generated")]

// Unity's .NET Standard API does not define the C# init-accessor marker.
namespace System.Runtime.CompilerServices
{
    internal sealed class IsExternalInit { }
}
