require_relative "test_helper"

class ArgumentTest < Minitest::Test
  def test_types_are_strict_and_false_is_preserved
    scope = Object.new
    assert_equal false, Lazzzy::Argument.new(:enabled, :boolean).coerce("no", controller: scope)
    assert_equal 123, Lazzzy::Argument.new(:id, :integer).coerce("00123", controller: scope)
    assert_equal "12.5", Lazzzy::Argument.new(:price, :decimal).coerce("12.50", controller: scope)
    assert_equal "premium", Lazzzy::Argument.new(:plan, :enum, values: %w[free premium]).coerce("Premium", controller: scope)
    assert_equal "premium_plus", Lazzzy::Argument.new(:plan, :enum, values: %w[free premium_plus]).coerce("premium plus", controller: scope)
    %w[1.5 100tokens 1e3].each do |value|
      assert_raises(Lazzzy::InvalidInput) { Lazzzy::Argument.new(:amount, :integer).coerce(value, controller: scope) }
    end
    assert_raises(Lazzzy::InvalidInput) { Lazzzy::Argument.new(:price, :decimal).coerce("NaN", controller: scope) }
    assert_raises(Lazzzy::InvalidInput) { Lazzzy::Argument.new(:flag, :boolean).coerce("maybe", controller: scope) }
    assert_nil Lazzzy::Argument.new(:note, :string, required: false).coerce(nil, controller: scope)
  end

  def test_dsl_rejects_invalid_registration
    config = Lazzzy::Configuration.new
    config.command(:home, description: "Home") { execute { Lazzzy::Result.navigate("/") } }
    assert_raises(ArgumentError) { config.command(:home, description: "Again") {} }
    assert_raises(ArgumentError) { config.command(:none, description: "Reserved") {} }
    assert_raises(ArgumentError) { Lazzzy::Argument.new(:date, :unknown) }
    assert_raises(ArgumentError) { Lazzzy::Argument.new(:plan, :enum) }
  end

  def test_navigation_rejects_external_or_ambiguous_paths
    ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test"].each do |path|
      assert_raises(Lazzzy::InvalidInput) { Lazzzy::Result.navigate(path) }
    end
    assert_equal({ kind: "navigate", url: "/users?sort=name" }, Lazzzy::Result.navigate("/users?sort=name"))
  end
end
